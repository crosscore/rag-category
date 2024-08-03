# rag-category/backend/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI, AzureOpenAI
from starlette.websockets import WebSocketDisconnect
import logging
import os
from io import BytesIO
from pypdf import PdfReader, PdfWriter
from utils.db_utils import get_db_connection, get_search_query
from config import *

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

app.mount("/data", StaticFiles(directory="/app/data"), name="data")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://frontend:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info(f"Application initialized with INDEX_TYPE: {INDEX_TYPE}, "
            f"IVFFLAT_PROBES: {IVFFLAT_PROBES}, HNSW_EF_SEARCH: {HNSW_EF_SEARCH}")

if ENABLE_OPENAI:
    client = OpenAI(api_key=OPENAI_API_KEY)
else:
    client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
        api_version=AZURE_OPENAI_API_VERSION
    )

@app.get("/pdf/{path:path}")
async def get_pdf(path: str, page: int = None):
    file_path = os.path.join("/app/data/pdf", path)
    logger.info(f"Attempting to access PDF file: {file_path}")
    if not os.path.exists(file_path):
        logger.error(f"PDF file not found: {file_path}")
        raise HTTPException(status_code=404, detail=f"PDF file not found: {file_path}")

    try:
        if page is not None and page > 0:
            logger.info(f"Extracting page {page} from PDF file: {file_path}")
            pdf_reader = PdfReader(file_path)
            pdf_writer = PdfWriter()

            if page <= len(pdf_reader.pages):
                pdf_writer.add_page(pdf_reader.pages[page - 1])
                pdf_bytes = BytesIO()
                pdf_writer.write(pdf_bytes)
                pdf_bytes.seek(0)
                return StreamingResponse(pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{os.path.basename(file_path)}_page_{page}.pdf"'})
            else:
                logger.error(f"Invalid page number: {page}")
                raise HTTPException(status_code=400, detail=f"Invalid page number: {page}")
        else:
            logger.info(f"Serving full PDF file: {file_path}")
            return FileResponse(file_path, media_type="application/pdf", filename=os.path.basename(file_path))
    except Exception as e:
        logger.error(f"Error serving PDF file: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error serving PDF file: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection established")
    try:
        while True:
            data = await websocket.receive_json()
            question = data["question"]
            top_n = int(data.get("top_n", 30))

            question_vector = client.embeddings.create(
                input=question,
                model=AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT
            ).data[0].embedding

            try:
                with get_db_connection() as (conn, cursor):
                    cursor.execute(get_search_query(INDEX_TYPE), (question_vector, top_n))
                    results = cursor.fetchall()
                    conn.commit()

                formatted_results = []
                for file_name, document_page, chunk_no, chunk_text, distance in results:
                    result = {
                        "file_name": str(file_name),
                        "page": int(document_page),
                        "chunk_no": int(chunk_no),
                        "chunk_text": str(chunk_text),
                        "distance": float(distance),
                        "category": os.path.basename(os.path.dirname(file_name)),
                        "link_text": f"/{os.path.relpath(file_name, '/app/data/pdf')}, p.{document_page}",
                        "link": f"pdf/{os.path.relpath(file_name, '/app/data/pdf')}?page={document_page}",
                    }
                    formatted_results.append(result)

                response_data = {
                    "results": formatted_results
                }
                await websocket.send_json(response_data)
                logger.info(f"Sent response for question: {question[:50]}...")
            except Exception as e:
                logger.error(f"Error processing query: {str(e)}")
                logger.exception("Full traceback:")
                await websocket.send_json({"error": str(e)})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Unexpected error in WebSocket connection: {str(e)}")
        logger.exception("Full traceback:")

@app.get("/")
async def root():
    return {"message": "Hello World"}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting the application")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")

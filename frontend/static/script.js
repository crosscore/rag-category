/* rag-category/frontend/static/script.js */

document.addEventListener("DOMContentLoaded", () => {
	const searchInput = document.getElementById("search-input");
	const searchButton = document.getElementById("search-button");
	const searchResults = document.getElementById("search-results");
	const categorySelect = document.getElementById("category-select");
	const aiResponse = document.getElementById("ai-response");

	let socket = new WebSocket("ws://" + window.location.host + "/ws");

	socket.onopen = function (e) {
		console.log("[open] WebSocket connection established");
	};

    socket.onmessage = function (event) {
		try {
			const data = JSON.parse(event.data);
			if (data.error) {
				searchResults.innerHTML = `<p>Error: ${data.error}</p>`;
				console.error("Error from server:", data.error);
				aiResponse.innerHTML =
					"<h2>AI Response:</h2><p>An error occurred while processing your request. Please try again.</p>";
			} else if (data.results && data.chunk_texts) {
				if (data.results.length === 0) {
					searchResults.innerHTML =
						"<p>No search results found. The AI will attempt to answer based on its general knowledge.</p>";
				} else {
					displayResults(data.results);
				}
				aiResponse.innerHTML = "<h2>AI Response:</h2><p></p>";
			} else if (data.ai_response_chunk) {
				const responseP = aiResponse.querySelector("p");
				responseP.innerHTML += data.ai_response_chunk;
			} else if (data.ai_response_end) {
				console.log("AI response streaming completed");
				const responseP = aiResponse.querySelector("p");
				responseP.innerHTML += "<br><em>(Response complete)</em>";
			} else {
				console.warn("Unhandled message type:", data);
			}
		} catch (error) {
			console.error("Error parsing WebSocket message:", error);
			searchResults.innerHTML = `<p>Error: Unable to process server response</p>`;
			aiResponse.innerHTML =
				"<h2>AI Response:</h2><p>An error occurred while processing the server response. Please try again.</p>";
		}
	};

	socket.onerror = function (error) {
		console.error(`WebSocket error: ${error.message}`);
		searchResults.innerHTML = `<p>Error: WebSocket connection failed</p>`;
	};

	socket.onclose = function (event) {
		if (event.wasClean) {
			console.log(
				`[close] WebSocket connection closed cleanly, code=${event.code} reason=${event.reason}`
			);
		} else {
			console.error("[close] WebSocket connection died");
			searchResults.innerHTML = `<p>Error: Connection to server lost</p>`;
		}
	};

	searchButton.addEventListener("click", () => {
		const query = searchInput.value;
		const category = categorySelect.value;
		if (query && category) {
			try {
				socket.send(
					JSON.stringify({ question: query, category: category })
				);
				searchResults.innerHTML = "<p>Searching...</p>";
				aiResponse.innerHTML =
					"<h2>AI Response:</h2><p>Waiting for results...</p>";
			} catch (error) {
				console.error("Error sending search request:", error);
				searchResults.innerHTML = `<p>Error: Unable to send search request</p>`;
			}
		} else {
			searchResults.innerHTML = `<p>Error: Please enter a query and select a category</p>`;
		}
	});

	function displayResults(results) {
		let resultsHTML = "<h2>Search Results</h2>";
		results.forEach((result, index) => {
			resultsHTML += `
                <div class="result">
                    <h3>${index + 1}. <a href="${
				result.link
			}" target="_blank">${result.link_text}</a></h3>
                    <p>Category: ${result.category}</p>
                    <p>${result.chunk_text}</p>
                    <p>Distance: ${result.distance.toFixed(4)}</p>
                </div>
            `;
		});
		searchResults.innerHTML = resultsHTML;
	}
});

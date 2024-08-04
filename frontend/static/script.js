/* rag-category/frontend/static/script.js */

document.addEventListener("DOMContentLoaded", () => {
	const searchInput = document.getElementById("search-input");
	const searchButton = document.getElementById("search-button");
	const searchResults = document.getElementById("search-results");
	const categorySelect = document.getElementById("category-select");
	const aiResponse = document.getElementById("ai-response");

	let socket = new WebSocket("ws://" + window.location.host + "/ws");

	socket.onopen = function (e) {
		console.log("[open] Connection established");
	};

	socket.onmessage = function (event) {
		const data = JSON.parse(event.data);
		if (data.error) {
			searchResults.innerHTML = `<p>Error: ${data.error}</p>`;
		} else if (data.results) {
			displayResults(data.results);
		} else if (data.streaming_response) {
			aiResponse.innerHTML += data.streaming_response;
		}
	};

	socket.onerror = function (error) {
		console.log(`[error] ${error.message}`);
	};

	searchButton.addEventListener("click", () => {
		const query = searchInput.value;
		const category = categorySelect.value;
		if (query) {
			socket.send(
				JSON.stringify({ question: query, category: category })
			);
			searchResults.innerHTML = "<p>Searching...</p>";
			aiResponse.innerHTML = "<h2>AI Response:</h2>";
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

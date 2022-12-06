function callApi(endpoint, token) {

    const headers = new Headers();
    const bearer = `Bearer ${token}`;

    headers.append("Authorization", bearer);

    const options = {
        method: "GET",
        headers: headers
    };

    logMessage("Calling Web API at " + endpoint);

    fetch(endpoint, options)
        .then(response => response.json())
        .then(response => {
            if (response) {
                logMessage('Web API responded:');
                logMessage('name: ' + response['name']);
                logMessage('issued-by: ' + response['issued-by']);
                logMessage('issued-for: ' + response['issued-for']);
                logMessage('scope: ' + response['scope']);   
                logMessage('some data: ' + response['data']);               
            }
            return response;
        }).catch(error => {
            console.error(error);
        });
}
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import { PublicClientApplication } from "@azure/msal-browser";
import { AuthenticatedTemplate, UnauthenticatedTemplate, MsalProvider } from "@azure/msal-react";
import { msalConfig, apiConfig, loginRequest, tokenRequest } from "./authConfig";

const msalInstance = new PublicClientApplication(msalConfig);

let username = "";

msalInstance.handleRedirectPromise()
    .then(handleResponse)
    .catch(error => {
        console.error(error);
    });

function selectAccount() {
    const currentAccounts = msalInstance.getAllAccounts();

    if (!currentAccounts || currentAccounts.length < 1) {
        return;
    } else if (currentAccounts.length > 1) {
        // Add your account choosing logic here
        console.warn("Multiple accounts detected.");
    } else if (currentAccounts.length === 1) {
        username = currentAccounts[0].username;
    }
}

function handleResponse(response) {
    if (response !== null) {
        username = response.account.username;
    } else {
        selectAccount();
    }
}

function logMessage(s) {
    const response = document.getElementById("log");

    response.appendChild(document.createTextNode('\n' + s + '\n'));
}

function callApi(endpoint, token) {
    const headers = new Headers();
    const bearer = `Bearer ${token}`;

    headers.append("Authorization", bearer);

    const options = {
        method: "GET",
        headers: headers
    };

    logMessage("Calling API at " + endpoint);

    fetch(endpoint, options)
        .then(response => response.json())
        .then(response => {
            if (response) {
                logMessage('API responded: ' + response['data']);
            } else {
                logMessage("No response from API");
            }
        }).catch(error => {
            console.error(error);
        });
}

function getTokenRedirect(request) {
    request.account = msalInstance.getAccountByUsername(username);
    
    return msalInstance.acquireTokenSilent(request)
        .catch(error => {
            console.warn("silent token acquisition fails. acquiring token using popup");
            if (typeof(error) instanceof msalInstance.InteractionRequiredAuthError) {
                return msalInstance.acquireTokenRedirect(request);
            } else {
                console.error(error);   
            }
    });
 }
 
 function passTokenToApi() {
     getTokenRedirect(tokenRequest)
         .then(response => {
             callApi(apiConfig.uri, response.accessToken);
         }).catch(error => {
             console.error(error);
         });
 }

const ApiData = () => {
    return (
        <button onClick={() => passTokenToApi()}>Get data</button>
    );
};

const SignInButton = () => {
    function handleLogin() {
        msalInstance.loginRedirect(loginRequest).catch(e => {
            console.error(e);
        });
    }
    return (
        <button onClick={() => handleLogin()}>Sign in</button>
    );
}

const SignOutButton = () => {
    const logoutRequest = {
        account: msalInstance.getAccountByUsername(username)
    };

    function handleLogout() {
        msalInstance.logoutRedirect(logoutRequest).catch(e => {
            console.error(e);
        });
    }
    return (
        <button onClick={() => handleLogout()}>Sign out</button>
    );
}

const HelloUser = () => {
    return (
        <p>Hello {username}!</p>
    );
}

ReactDOM.render(
    <React.StrictMode>
        <MsalProvider instance={msalInstance}>
            <AuthenticatedTemplate>
                <HelloUser />
                <SignOutButton />
                <ApiData />
                <pre id="log"></pre>
            </AuthenticatedTemplate>

            <UnauthenticatedTemplate>
                <p>Hello stranger, please sign-in.</p>
                <SignInButton />
            </UnauthenticatedTemplate>
        </MsalProvider>
    </React.StrictMode>,
    document.getElementById("root")
);

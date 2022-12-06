/**
 * Configuration object to be passed to MSAL instance on creation. 
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md 
 */
export const msalConfig = {
    auth: {
        clientId: "d4d48e90-ae46-4ce3-b2e6-daaa0807801b",
        authority: "https://login.microsoftonline.com/f1a22902-60b9-47ff-92b8-80b0e015933a",
        redirectUri: "https://lively-forest-0afe58103.1.azurestaticapps.net/", // e.g. http://localhost:3000 https://lively-forest-0afe58103.1.azurestaticapps.net/
    },
    cache: {
        cacheLocation: "sessionStorage", // This configures where your cache will be stored localStorage / sessionStorage
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    }
};

// Add here the endpoints and scopes for the web API you would like to use.
export const apiConfig = {
    uri: "https://react-api-samuv.azurewebsites.net/api", // e.g.  https://react-api-samuv.azurewebsites.net/api http://localhost:5000/api
    scopes: ["api://41445ee6-bb06-42aa-a8aa-784ae690bc32/access_as_user"] // e.g. ["scp1", "scp2"]
};

/**
 * Scopes you add here will be prompted for user consent during sign-in.
 * By default, MSAL.js will add OIDC scopes (openid, profile, email) to any login request.
 * For more information about OIDC scopes, visit: 
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
 */
 export const loginRequest = {
    scopes: ["openid", "profile"]
};

/**
 * Scopes you add here will be used to request a token from Azure AD to be used for accessing a protected resource.
 * To learn more about how to work with scopes and resources, see: 
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/resources-and-scopes.md
 */
 export const tokenRequest = {
    scopes: [...apiConfig.scopes],
};

// exporting config object for jest
if (typeof exports !== 'undefined') {
    module.exports = {
        msalConfig: msalConfig,
    };
}

export const msalConfig = {
    auth: {
      clientId: "ENTER_THE_APPLICATION_ID_HERE", // From Azure Portal App registrations
      authority: "ENTER_THE_CLOUD_INSTANCE_ID_HERE/ENTER_THE_TENANT_INFO_HERE", // This is a URL (e.g. https://login.microsoftonline.com/{your tenant ID})
      redirectUri: "ENTER_THE_REDIRECT_URI_HERE", // Add this URL also to Azure Portal App registrations
    },
    cache: {
      cacheLocation: "sessionStorage", // This configures where your cache will be stored
      storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    }
  };
  
  // Add scopes here for ID token to be used at Microsoft identity platform endpoints.
  export const loginRequest = {
   scopes: ["User.Read"]
  };
  
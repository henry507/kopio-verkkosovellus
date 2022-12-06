import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { withAITracking } from '@microsoft/applicationinsights-react-js';
import { reactPlugin } from './appInsights';
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";

function SignInButton() {
  const { instance } = useMsal();

  return <Button variant="primary" onClick={() => instance.loginRedirect()}>Sign in</Button>;
}

function SignOutButton() {
  const { instance } = useMsal();

  return <Button variant="primary" onClick={() => instance.logoutRedirect()}>Sign out</Button>;
}

function HelloUser() {
  const { accounts } = useMsal();
  const email = accounts[0].username;

  return <Alert.Heading>Hello, nice to see you {email}</Alert.Heading>;
}

function HelloStanger() {
  return <Alert.Heading>Hello stranger, please sign in to continue.</Alert.Heading>;
}

function App() {
  return (
    <p>
      <AuthenticatedTemplate>
        <Alert variant="success">
          <HelloUser />
          <hr />
          <SignOutButton />
        </Alert>
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <Alert variant="warning">
          <HelloStanger />
          <hr />
          <SignInButton />
        </Alert>
      </UnauthenticatedTemplate>
    </p>
  );
}

export default withAITracking(reactPlugin, App);

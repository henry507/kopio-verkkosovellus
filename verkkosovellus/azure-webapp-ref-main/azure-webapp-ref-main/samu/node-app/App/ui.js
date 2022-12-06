const signInButton = document.getElementById('signIn');
const signOutButton = document.getElementById('signOut');
const welcomeDiv = document.getElementById('welcome-div');
const tableDiv = document.getElementById('table-div');
const tableBody = document.getElementById('table-body-div');
const response = document.getElementById("response");
const label = document.getElementById('label');

function welcomeUser(username) {
    label.classList.add('d-none');
    signInButton.classList.add('d-none');
    signOutButton.classList.remove('d-none');
    welcomeDiv.classList.remove('d-none');
    welcomeDiv.innerHTML = `Welcome ${username}!`;
    passTokenToApi();
}

function logMessage(s) {
    response.appendChild(document.createTextNode('\n' + s + '\n'));
}
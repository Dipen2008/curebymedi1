/* Auth form wiring for login + signup pages */

function setupAuthForm({ mode }) {
  const form = document.getElementById("form");
  const errBox = document.getElementById("error");
  const btnText = document.getElementById("btn-text");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");
    errBox.textContent = "";
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    if (!email || !password) { showError("Please fill all fields"); return; }
    if (mode === "signup" && password.length < 6) { showError("Password must be at least 6 characters"); return; }

    btnText.textContent = mode === "login" ? "Logging in…" : "Creating account…";
    form.querySelector("button[type=submit]").disabled = true;
    try {
      const fn = mode === "login" ? A.login : A.signup;
      const res = await fn(email, password);
      if (res.token) setToken(res.token);
      window.location.href = "/dashboard.html";
    } catch (err) {
      showError(err.message || "Something went wrong");
    } finally {
      form.querySelector("button[type=submit]").disabled = false;
      btnText.textContent = mode === "login" ? "Log in" : "Create account";
    }
  });

  function showError(msg) {
    errBox.textContent = msg;
    errBox.classList.remove("hidden");
  }
}

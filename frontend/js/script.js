const API = "http://localhost:3000";

const root = document.createElement("div");
document.body.appendChild(root);

function setToken(t) {
  localStorage.setItem("token", t);
}

function getToken() {
  return localStorage.getItem("token");
}

function clearToken() {
  localStorage.removeItem("token");
}

let currentUser = null;

const api = {
  loading: false,

  async request(url, method = "GET", body) {
    if (this.loading) return { error: "busy" };
    this.loading = true;

    try {
      const res = await fetch(API + url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: "Bearer " + getToken() } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await res.json();

      if (res.status === 401) {
        clearToken();
        currentUser = null;
        authUI();
        return { error: "unauthorized" };
      }

      return data;

    } catch {
      return { error: "network_error" };

    } finally {
      this.loading = false;
    }
  }
};

async function req(url, method = "GET", body) {
  return api.request(url, method, body);
}

function clear() {
  root.innerHTML = "";
}

function createHeader() {
  const header = document.createElement("div");
  header.className = "header";

  const left = document.createElement("div");
  left.className = "left";

  const logo = document.createElement("div");
  logo.className = "logo";
  logo.textContent = "tt";

  left.append(logo);

  const right = document.createElement("div");
  right.className = "right";

  const user = document.createElement("div");
  user.className = "user";
  user.textContent = currentUser ? currentUser.login : "";

  const logout = document.createElement("button");
  logout.textContent = "logout";

  logout.onclick = () => {
    clearToken();
    currentUser = null;
    authUI();
  };

  right.append(user, logout);

  header.append(left, right);
  return header;
}

function authUI() {
  clear();

  const login = document.createElement("input");
  login.placeholder = "login";

  const pass = document.createElement("input");
  pass.type = "password";
  pass.placeholder = "password";

  const msg = document.createElement("div");

  const btnLogin = document.createElement("button");
  btnLogin.textContent = "login";

  const btnReg = document.createElement("button");
  btnReg.textContent = "register";

  btnLogin.onclick = async () => {
    const res = await req("/login", "POST", {
      login: login.value,
      password: pass.value
    });

    if (res.error) return msg.textContent = res.error;

    setToken(res.token);
    currentUser = res.user;

    appUI();
  };

  btnReg.onclick = async () => {
    const res = await req("/register", "POST", {
      login: login.value,
      password: pass.value
    });

    if (res.error) return msg.textContent = res.error;

    setToken(res.token);
    currentUser = res.user;

    appUI();
  };

  root.append(login, pass, btnLogin, btnReg, msg);
}

async function appUI() {
  clear();

  const me = await req("/me");

  if (me.error) {
    clearToken();
    authUI();
    return;
  }

  currentUser = me;

  const container = document.createElement("div");
  container.className = "container";

  const header = createHeader();

  const list = document.createElement("div");
  list.id = "list";

  const inputCard = document.createElement("div");
  inputCard.className = "task-input-card";

  const input = document.createElement("input");
  input.placeholder = "New task...";

  inputCard.appendChild(input);

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    if (!input.value.trim()) return;

    await req("/tasks", "POST", { name: input.value });

    input.value = "";
    load();
  });

  async function load() {
    list.innerHTML = "";

    const tasks = await req("/tasks");

    if (!Array.isArray(tasks)) {
      clearToken();
      authUI();
      return;
    }

    tasks.forEach(t => {
      const row = document.createElement("div");
      row.className = "task-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = t.status === "done";

      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = t.name;

      const del = document.createElement("button");
      del.className = "delete-btn";

      del.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>
      `;

      checkbox.onchange = async () => {
        checkbox.disabled = true;

        await req(`/tasks/${t.id}`, "PATCH", {
          status: checkbox.checked ? "done" : "pending"
        });

        checkbox.disabled = false;
        load();
      };

      del.onclick = async () => {
        del.disabled = true;

        await req(`/tasks/${t.id}`, "DELETE");

        del.disabled = false;
        load();
      };

      row.append(checkbox, text, del);
      list.appendChild(row);
    });
  }

  container.append(header, inputCard, list);
  root.append(container);

  load();
}

if (getToken()) appUI();
else authUI();
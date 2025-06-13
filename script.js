let taskList = document.getElementById("task-list");
let timers = {}, pausedTimers = {};

const dayPausas = {
  1: "18:00:00", 2: "18:00:00", 3: "18:00:00", 4: "18:00:00",
  5: "17:00:00", 6: "12:00:00" // viernes y sábado
};

const INDIVIDUAL_PAUSES = {
  "Omar": { pausa: "12:00:00", reanuda: "14:00:00" },
  "Rolfi": { pausa: "13:00:00", reanuda: "14:00:00" },
  "Jairo": { pausa: "12:30:00", reanuda: "13:30:00" }
};

const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbxItUDgTduLsyET_QStL548UdlGD0-FZg_7hicSENgUr7L2hrR9P-uTMM65JAZQSYaWag/exec";

window.onload = () => {
  const saved = JSON.parse(localStorage.getItem("pedidos")) || [];
  saved.forEach(pedido => reconstruirPedido(pedido));
};

function agregarPedido() {
  const codigo = document.getElementById("codigo").value.trim();
  const sacador = document.getElementById("sacador").value;
  const cantidad = parseInt(document.getElementById("cantidad").value.trim(), 10);

  if (!codigo || !sacador || isNaN(cantidad) || cantidad <= 0) {
    alert("Completa todos los campos correctamente.");
    return;
  }

  const index = Date.now();
  const now = new Date();
  const dia = now.getDay();

  if (dia === 0) {
    alert("Los domingos no se pueden iniciar pedidos.");
    return;
  }

  const task = document.createElement("div");
  task.className = "task";
  task.innerHTML = `
    <h3 id="codigo-${index}">${codigo}</h3>
    <p id="sacador-${index}">${sacador}</p>
    <p>Cantidad de productos: <span>${cantidad}</span></p>
    <p>Inicio: <span id="start-${index}">${now.toLocaleString()}</span></p>
    <p>Final: <span id="end-${index}">--/-- --:--:--</span></p>
    <p>Tiempo: <span id="timer-${index}">00:00:00</span></p>
    <button onclick="pausar(${index})">Pausar</button>
    <button onclick="reanudar(${index})">Reanudar</button>
    <button onclick="finalizar(${index})">Finalizar</button>
  `;
  taskList.appendChild(task);

  pausedTimers[index] = {
    startTimestamp: now.getTime(),
    pausedDuration: 0,
    pausedAt: null,
    paused: false,
    cantidad,
    sacador,
    tipoPausa: null,
    reanudado: false
  };

  iniciarTimer(index);
  programarPausas(index, sacador, now);
  guardarPedidos();
}

function iniciarTimer(index) {
  timers[index] = setInterval(() => {
    const data = pausedTimers[index];
    let elapsed = 0;
    if (!data.paused) {
      elapsed = Date.now() - data.startTimestamp - data.pausedDuration;
    } else if (data.pausedAt) {
      elapsed = data.pausedAt - data.startTimestamp - data.pausedDuration;
    }
    document.getElementById(`timer-${index}`).textContent = formatTime(Math.floor(elapsed / 1000));
  }, 1000);
}

function programarPausas(index, sacador, now) {
  const dia = now.getDay();

  if (INDIVIDUAL_PAUSES[sacador]) {
    const p1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].pausa);
    const r1 = getFutureTime(now, INDIVIDUAL_PAUSES[sacador].reanuda);
    setTimeout(() => autoPause(index, "individual"), p1 - now);
    setTimeout(() => autoReanudar(index), r1 - now);
  }

  if (dayPausas[dia]) {
    const pausaGeneral = getFutureTime(now, dayPausas[dia]);
    const reanuda = getFutureTime(addDays(now, 1), "08:00:00");
    setTimeout(() => autoPause(index, "general"), pausaGeneral - now);
    setTimeout(() => autoReanudar(index), reanuda - now);
  }
}

function autoPause(index, tipo) {
  if (!timers[index]) return;
  const now = new Date();
  pausedTimers[index].pausedAt = now.getTime();
  pausedTimers[index].paused = true;
  pausedTimers[index].tipoPausa = tipo;
  console.log(`⏸️ Pedido ${index} pausado automáticamente (${tipo}).`);
}

function autoReanudar(index) {
  const data = pausedTimers[index];
  if (data.paused) {
    const now = Date.now();
    data.pausedDuration += now - data.pausedAt;
    data.paused = false;
    data.pausedAt = null;
    data.reanudado = true;
    console.log(`▶️ Pedido ${index} reanudado automáticamente.`);
  }
}

function finalizar(index) {
  const now = new Date();
  document.getElementById(`end-${index}`).textContent = now.toLocaleString();
  clearInterval(timers[index]);

  const data = pausedTimers[index];
  const total = data.cantidad;
  const cantidadSacada = parseInt(prompt(`¿Cuántos productos se sacaron del pedido? (Esperado: ${total})`), 10);
  if (isNaN(cantidadSacada) || cantidadSacada < 0 || cantidadSacada > total) {
    alert("Cantidad inválida.");
    return;
  }

  const porcentaje = Math.round((cantidadSacada / total) * 100);
  const duracionMs = now.getTime() - data.startTimestamp - data.pausedDuration;
  const duracionStr = formatTime(Math.floor(duracionMs / 1000));

  alert(`${data.sacador} sacó un ${porcentaje}% del pedido.`);

  fetch(GOOGLE_SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      codigo: document.getElementById(`codigo-${index}`).textContent,
      sacador: data.sacador,
      cantidadProductos: total,
      horaInicio: new Date(data.startTimestamp).toISOString(),
      horaFin: now.toISOString(),
      tiempoTotal: duracionStr,
      tipoPausa: data.tipoPausa,
      reanudado: data.reanudado
    })
  });

  delete pausedTimers[index];
  delete timers[index];
  document.getElementById(`codigo-${index}`).closest(".task").remove();
  guardarPedidos();
}

function formatTime(s) {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function getFutureTime(date, timeStr) {
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, s);
}

function addDays(date, d) {
  const newDate = new Date(date);
  newDate.setDate(date.getDate() + d);
  return newDate;
}

function guardarPedidos() {
  localStorage.setItem("pedidos", JSON.stringify(pausedTimers));
}

function pausarTodos() { for (let i in pausedTimers) autoPause(i, "manual"); }
function reanudarTodos() { for (let i in pausedTimers) autoReanudar(i); }

function reconstruirPedido(pedido) {
  const index = pedido.index;
  const task = document.createElement("div");
  task.className = "task";
  task.innerHTML = `
    <h3 id="codigo-${index}">${pedido.codigo}</h3>
    <p id="sacador-${index}">${pedido.sacador}</p>
    <p>Cantidad de productos: <span>${pedido.cantidad}</span></p>
    <p>Inicio: <span id="start-${index}">${pedido.startTimeStr || new Date(pedido.startTimestamp).toLocaleString()}</span></p>
    <p>Final: <span id="end-${index}">--/-- --:--:--</span></p>
    <p>Tiempo: <span id="timer-${index}">00:00:00</span></p>
    <button onclick="pausar(${index})">Pausar</button>
    <button onclick="reanudar(${index})">Reanudar</button>
    <button onclick="finalizar(${index})">Finalizar</button>
  `;
  taskList.appendChild(task);
  pausedTimers[index] = pedido;
  iniciarTimer(index);
  programarPausas(index, pedido.sacador, new Date());
}

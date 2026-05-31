(function () {
  function draw(canvas, values) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#14191b";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const mid = h / 2;
    ctx.strokeStyle = "rgba(231,198,99,.7)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    if (values.length < 2) return;
    ctx.strokeStyle = "#41c08e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = values.length === 1 ? 0 : (w - 18) * (i / (values.length - 1)) + 9;
      const y = h - (v / 100) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = values[values.length - 1];
    ctx.fillStyle = last >= 50 ? "#41c08e" : "#e36f61";
    ctx.beginPath();
    ctx.arc(w - 9, h - (last / 100) * h, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  window.ShogiGraph = { draw };
})();

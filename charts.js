/* 외부 라이브러리 없이 canvas로 그리는 간단한 차트 */
(function () {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  document.body.appendChild(tip);

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = parseInt(canvas.getAttribute('height'), 10);
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /**
   * opts: { labels[], series:[{name,values[],color,fill}], bands:[{from,to,color}],
   *         yUnit, yMax, xTick(i)->label|null, tooltip(i)->string, markers:[{i,color,label}] }
   */
  function line(canvas, opts) {
    const draw = () => {
      const { ctx, w, h } = setup(canvas);
      const pad = { l: 44, r: 30, t: 12, b: 26 };
      const n = opts.labels.length;
      const all = opts.series.flatMap((s) => s.values);
      const yMin = opts.yMin != null ? opts.yMin : 0;
      const yMax = opts.yMax || Math.ceil(Math.max(...all) * 1.15 / 10) * 10;
      const X = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
      const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '12px Pretendard, Malgun Gothic, sans-serif';

      (opts.bands || []).forEach((b) => {
        ctx.fillStyle = b.color;
        ctx.fillRect(X(b.from), pad.t, Math.max(1, X(b.to) - X(b.from)), h - pad.t - pad.b);
      });

      // grid
      ctx.strokeStyle = '#e3e7ee'; ctx.lineWidth = 1; ctx.fillStyle = '#5a6577';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const steps = 4;
      for (let k = 0; k <= steps; k++) {
        const v = yMin + ((yMax - yMin) * k) / steps;
        const y = Y(v);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillText(Math.round(v) + (k === steps && opts.yUnit ? opts.yUnit : ''), pad.l - 6, y);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i < n; i++) {
        const lab = opts.xTick ? opts.xTick(i) : opts.labels[i];
        if (lab != null) ctx.fillText(lab, X(i), h - pad.b + 6);
      }

      opts.series.forEach((s) => {
        if (s.fill) {
          ctx.beginPath(); ctx.moveTo(X(0), Y(yMin));
          s.values.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
          ctx.lineTo(X(n - 1), Y(yMin)); ctx.closePath();
          ctx.fillStyle = s.fill; ctx.fill();
        }
        ctx.beginPath();
        s.values.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.lineJoin = 'round';
        if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
        ctx.stroke(); ctx.setLineDash([]);
        if (s.dots) s.values.forEach((v, i) => {
          ctx.beginPath(); ctx.arc(X(i), Y(v), 4, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = s.color; ctx.stroke();
        });
      });

      (opts.hlines || []).forEach((l) => {
        ctx.setLineDash([5, 4]); ctx.strokeStyle = l.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pad.l, Y(l.v)); ctx.lineTo(w - pad.r, Y(l.v)); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(l.label, w - pad.r - 4, Y(l.v) - 3);
      });

      canvas._geom = { X, Y, n, pad, w };
    };
    draw();
    canvas._redraw = draw;

    if (opts.tooltip && !canvas._tipBound) {
      canvas._tipBound = true;
      canvas.addEventListener('mousemove', (e) => {
        const g = canvas._geom; if (!g) return;
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const i = Math.round(((x - g.pad.l) / (g.w - g.pad.l - g.pad.r)) * (g.n - 1));
        if (i < 0 || i >= g.n) { tip.style.display = 'none'; return; }
        tip.innerHTML = canvas._opts.tooltip(i);
        tip.style.display = 'block';
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY - 34 + 'px';
      });
      canvas.addEventListener('mouseleave', () => (tip.style.display = 'none'));
    }
    canvas._opts = opts;
  }

  window.addEventListener('resize', () => {
    document.querySelectorAll('canvas').forEach((c) => c._redraw && c.offsetParent && c._redraw());
  });

  window.Charts = { line };
})();

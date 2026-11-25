(function () {
  const D = window.DEMO;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const num = (n, d = 0) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const LV = { ok: ['lv-ok', '정상'], warn: ['lv-warn', '주의'], bad: ['lv-bad', '위험'], info: ['lv-info', '안내'] };
  const lvTag = (lv) => `<span class="lv ${LV[lv][0]}">${LV[lv][1]}</span>`;
  const STATE = {
    off: { name: '꺼짐', color: 'rgba(138,148,166,.12)' },
    idle: { name: '무부하(낭비 가능)', color: 'rgba(242,169,0,.20)' },
    prod: { name: '생산', color: 'rgba(46,125,91,.12)' },
  };
  const hhmm = (i) => `${String(Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`;
  const hourTick = (i) => (i % 18 === 0 ? `${i / 6}시` : null);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- header ----------
  $('#factoryName').textContent = D.factory.name;
  $('#factoryMeta').textContent = D.factory.meta;
  const tickClock = () => {
    const d = new Date();
    $('#liveStatus').innerHTML = `<span class="dot"></span>실시간 수신 중 · ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  tickClock(); setInterval(tickClock, 30000);

  // ---------- tabs ----------
  const rendered = {};
  function openTab(name) {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    if (!rendered[name] && RENDER[name]) { RENDER[name](); rendered[name] = true; }
    else $$('#tab-' + name + ' canvas').forEach((c) => c._redraw && c._redraw());
    history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]'); if (g) openTab(g.dataset.goto);
  });

  function bandsOf(pts) {
    const out = []; let start = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i === pts.length || pts[i].state !== pts[start].state) {
        out.push({ from: start, to: i - 1 + (i < pts.length ? 1 : 0), color: STATE[pts[start].state].color });
        start = i;
      }
    }
    return out;
  }
  const stateLegend = (el) => {
    el.innerHTML = Object.values(STATE).map((s) => `<span><i style="background:${s.color.replace(/[\d.]+\)$/, '.6)')}"></i>${s.name}</span>`).join('')
      + '<span><i style="background:#1b2a41;height:3px"></i>메인 전류(A)</span>';
  };

  // ---------- alerts helpers ----------
  const unresolved = () => D.alerts.filter((a) => !a.result && a.lv !== 'info').length;
  const updateBadge = () => { const n = unresolved(); $('#alertBadge').textContent = n || ''; $('#alertBadge').style.display = n ? '' : 'none'; };

  function alertHTML(a, withActions) {
    const res = a.result === 'confirmed' ? '<div class="alert-result" style="color:var(--green)">✔ 현장 확인: 실제 이상 있음 (조치 완료)</div>'
      : a.result === 'false' ? '<div class="alert-result" style="color:var(--gray)">✔ 현장 확인: 오경보 (AI 재학습에 반영)</div>' : '';
    const actions = withActions && !a.result && a.lv !== 'info'
      ? `<div class="alert-actions">
           <button class="primary" data-act="confirmed" data-id="${a.id}">실제 이상 확인</button>
           <button data-act="false" data-id="${a.id}">오경보로 표시</button>
           <button data-act="call" data-id="${a.id}">대행업체 점검 요청</button>
         </div>` : '';
    return `<div class="alert">
      <div>${lvTag(a.lv)}</div>
      <div><div class="alert-title">[${a.cat}] ${a.title}</div><div class="alert-desc">${a.desc}</div>${res}${actions}</div>
      <div class="alert-time">${a.time}</div>
    </div>`;
  }

  // ---------- renderers ----------
  const RENDER = {
    home() {
      const s = D.summary.weekday;
      const fireLv = D.alerts.some((a) => a.cat === '화재' && a.lv === 'bad' && !a.result) ? 'bad' : 'warn';
      const worst = D.machines.reduce((a, b) => (a.score > b.score ? a : b));
      $('#kpis').innerHTML = `
        <div class="kpi"><div class="kpi-label">오늘 사용 전력</div><div class="kpi-value">${num(s.total)}<small>kWh</small></div><div class="kpi-desc">약 ${won(s.total * D.PRICE_PER_KWH)}</div></div>
        <div class="kpi warn"><div class="kpi-label">조업 외 낭비 전력 (오늘)</div><div class="kpi-value">${num(s.idleOff)}<small>kWh</small></div><div class="kpi-desc">약 ${won(s.idleOff * D.PRICE_PER_KWH)} · 한 달(26일)이면 약 ${won(s.idleOff * D.PRICE_PER_KWH * 26)}</div></div>
        <div class="kpi ${fireLv}"><div class="kpi-label">화재 위험 등급</div><div class="kpi-value">${LV[fireLv][1]}</div><div class="kpi-desc">T상 단자 온도 상승 · 아크 신호 없음</div></div>
        <div class="kpi ${worst.level}"><div class="kpi-label">설비 이상 점수 최고</div><div class="kpi-value">${worst.score}<small>/100</small></div><div class="kpi-desc">${worst.name} · 4주 연속 상승</div></div>`;

      $('#todoList').innerHTML = D.todos.map((t, i) => `
        <li><div><div class="todo-title" id="todo-t-${i}">${t.title}</div><div class="todo-desc">${t.desc}</div>
        <button data-todo="${i}">완료로 표시</button></div></li>`).join('');
      $('#todoList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-todo]'); if (!b) return;
        const el = $('#todo-t-' + b.dataset.todo); el.classList.toggle('todo-done');
        b.textContent = el.classList.contains('todo-done') ? '되돌리기' : '완료로 표시';
        if (el.classList.contains('todo-done')) toast('조치 이행이 기록되었습니다');
      });

      const pts = D.days.weekday;
      Charts.line($('#miniChart'), {
        labels: pts.map((p) => hhmm(p.t)), xTick: hourTick, yUnit: 'A', yMax: 100,
        bands: bandsOf(pts),
        series: [{ values: pts.map((p) => p.amp), color: '#1b2a41', width: 1.8 }],
        tooltip: (i) => `${hhmm(i)} · ${pts[i].amp}A · ${STATE[pts[i].state].name}`,
      });
      stateLegend($('#miniLegend'));
      $('#recentAlerts').innerHTML = D.alerts.slice(0, 3).map((a) => alertHTML(a, false)).join('');
    },

    energy() {
      const draw = (day) => {
        const pts = D.days[day];
        Charts.line($('#energyChart'), {
          labels: pts.map((p) => hhmm(p.t)), xTick: hourTick, yUnit: 'A', yMax: 100,
          bands: bandsOf(pts),
          series: [{ values: pts.map((p) => p.amp), color: '#1b2a41', fill: 'rgba(27,42,65,.06)' }],
          tooltip: (i) => `${hhmm(i)} · ${pts[i].amp}A · 약 ${num(D.kwOf(pts[i].amp), 1)}kW · ${STATE[pts[i].state].name}`,
        });
        const s = D.summary[day];
        const idleH = pts.filter((p) => p.state === 'idle' && (p.h < 8 || p.h >= 18.5)).length / 6;
        $('#energyStats').innerHTML = `
          <div class="card"><div class="hint">하루 사용량</div><div class="stat-big">${num(s.total)}<small> kWh</small></div><div class="stat-sub">약 ${won(s.total * D.PRICE_PER_KWH)}</div></div>
          <div class="card"><div class="hint">조업 외 무부하 시간</div><div class="stat-big" style="color:#b07b00">${num(idleH, 1)}<small> 시간</small></div><div class="stat-sub">생산 없이 설비가 켜져 있던 시간</div></div>
          <div class="card"><div class="hint">조업 외 낭비 전력</div><div class="stat-big" style="color:var(--red)">${num(s.idleOff)}<small> kWh</small></div><div class="stat-sub">약 ${won(s.idleOff * D.PRICE_PER_KWH)} <span class="estimate">추정</span></div></div>`;
      };
      draw('weekday');
      stateLegend($('#energyLegend'));
      $('#daySeg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        $$('#daySeg button').forEach((x) => x.classList.toggle('active', x === b));
        draw(b.dataset.day);
      });
      const rows = D.machines.slice().sort((a, b) => b.hoursIdle - a.hoursIdle);
      const max = rows[0].hoursIdle;
      $('#wasteTable').innerHTML = `<tr><th>설비</th><th>조업 외 무부하 시간</th><th style="width:40%"></th><th>추정 낭비</th></tr>` +
        rows.map((m) => `<tr><td><b>${m.name}</b></td><td>${num(m.hoursIdle, 1)}시간</td>
          <td><div class="bar"><div style="width:${(m.hoursIdle / max) * 100}%;background:${m.hoursIdle > 10 ? 'var(--amber)' : '#c9d1dc'}"></div></div></td>
          <td>약 ${won(m.hoursIdle * 6.7 * D.PRICE_PER_KWH)}</td></tr>`).join('');
    },

    fire() {
      const t = D.temps; const last = (a) => a[a.length - 1];
      const maxT = Math.max(...t.T);
      const maxGap = Math.max(...t.T.map((v, i) => v - t.R[i]));
      $('#fireCards').innerHTML = `
        <div class="card"><div class="hint">현재 화재 위험 등급</div><div class="stat-big" style="color:#b07b00">주의</div><div class="stat-sub">온도 이상 1건 · 아크 신호 없음</div></div>
        <div class="card"><div class="hint">단자 최고 온도 (오늘)</div><div class="stat-big">${num(maxT, 1)}<small> °C</small></div><div class="stat-sub">T상 · 같은 부하의 R상보다 최대 약 ${num(maxGap, 0)}°C 높음</div></div>
        <div class="card"><div class="hint">이번 주 아크 감지</div><div class="stat-big">${D.arcLog.length}<small> 건</small></div><div class="stat-sub">위험 1건(조치 완료) · 오경보 1건</div></div>`;
      Charts.line($('#tempChart'), {
        labels: t.R.map((_, i) => hhmm(i)), xTick: hourTick, yUnit: '°C', yMin: 20, yMax: 70,
        series: [
          { name: 'R', values: t.R, color: '#8a94a6', width: 1.6 },
          { name: 'S', values: t.S, color: '#34557f', width: 1.6 },
          { name: 'T', values: t.T, color: '#d9472b', width: 2.2 },
        ],
        hlines: [{ v: 60, color: '#d9472b', label: '주의 기준 60°C' }],
        tooltip: (i) => `${hhmm(i)} · R ${t.R[i]}° · S ${t.S[i]}° · <b>T ${t.T[i]}°</b>`,
      });
      $('#tempLegend').innerHTML = '<span><i style="background:#8a94a6"></i>R상</span><span><i style="background:#34557f"></i>S상</span><span><i style="background:#d9472b"></i>T상 (조임 불량 의심)</span>';
      $('#arcTable').innerHTML = '<tr><th>시각</th><th>위치</th><th>온도 변화</th><th>등급</th><th>현장 확인</th></tr>' +
        D.arcLog.map((r) => `<tr><td>${r.time}</td><td>${r.where}</td><td>${r.temp}</td><td>${lvTag(r.lv)}</td><td>${r.result}</td></tr>`).join('');
    },

    machines() {
      const select = (id) => {
        const m = D.machines.find((x) => x.id === id);
        $$('.machine').forEach((c) => c.classList.toggle('selected', c.dataset.id === id));
        $('#machineDetailTitle').textContent = `${m.name} · 이상 점수 추이`;
        Charts.line($('#machineChart'), {
          labels: ['8주 전', '7주 전', '6주 전', '5주 전', '4주 전', '3주 전', '2주 전', '이번 주'],
          yMax: 100, yUnit: '점',
          series: [{ values: m.trend, color: m.level === 'ok' ? '#2e7d5b' : '#d9472b', dots: true, width: 2.4 }],
          hlines: [{ v: 50, color: '#b07b00', label: '점검 권고 50점' }, { v: 80, color: '#d9472b', label: '위험 80점' }],
          tooltip: (i) => `${m.trend[i]}점`,
        });
        $('#machineNote').innerHTML = `<b>AI 해설:</b> ${m.note}`;
      };
      $('#machineCards').innerHTML = D.machines.map((m) => `
        <div class="machine" data-id="${m.id}">
          <div class="machine-name">${m.name}${lvTag(m.level)}</div>
          <div class="machine-score" style="color:${m.level === 'ok' ? 'var(--green)' : m.score > 50 ? 'var(--red)' : '#b07b00'}">${m.score}<small> /100 이상 점수</small></div>
          <div class="machine-meta">현재 상태 <b>${m.state}</b> · 3상 불평형 <b>${m.unbalance}%</b></div>
        </div>`).join('');
      $('#machineCards').addEventListener('click', (e) => { const c = e.target.closest('.machine'); if (c) select(c.dataset.id); });
      select('furnace2');
    },

    alerts() {
      let filter = 'all';
      const draw = () => {
        const list = D.alerts.filter((a) => filter === 'all' || a.lv === filter);
        $('#alertList').innerHTML = list.length ? list.map((a) => alertHTML(a, true)).join('') : '<p class="hint">해당 알림이 없습니다.</p>';
      };
      draw();
      $('#alertFilter').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        $$('#alertFilter button').forEach((x) => x.classList.toggle('active', x === b));
        filter = b.dataset.lv; draw();
      });
      $('#alertList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const a = D.alerts.find((x) => x.id === +b.dataset.id);
        if (b.dataset.act === 'call') { toast('전기안전 대행업체에 점검 요청을 보냈습니다 (시연)'); return; }
        a.result = b.dataset.act; draw(); updateBadge();
        toast(a.result === 'false' ? '오경보로 기록했습니다. AI 기준값에 반영됩니다' : '실제 이상으로 기록했습니다');
      });
    },

    report() {
      const m = D.month;
      const cut = (1 - m.idleNowKwh / m.idleBeforeKwh) * 100;
      const yoy = (1 - m.usageKwh / m.lastYearKwh) * 100;
      const acc = (m.alertsConfirmed / (m.alertsConfirmed + m.falseAlarms)) * 100;
      $('#reportCard').innerHTML = `
        <button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
        <h2>${m.label} 월간 리포트</h2>
        <div class="period">${D.factory.name} · 생성형 AI 작성, 수치는 분석 모델 결과만 사용</div>
        <div class="report-grid">
          <div class="report-box"><div class="k">이번 달 사용량</div><div class="v">${num(m.usageKwh)} kWh</div><div class="hint">전년 같은 달보다 ${num(yoy, 1)}% 감소 (가동일 보정)</div></div>
          <div class="report-box"><div class="k">조업 외 무부하 전력</div><div class="v" style="color:var(--green)">−${num(cut, 0)}%</div><div class="hint">학습 기간 ${num(m.idleBeforeKwh)} → ${num(m.idleNowKwh)} kWh</div></div>
          <div class="report-box"><div class="k">경보 정확도</div><div class="v">${num(acc, 0)}%</div><div class="hint">현장 확인 ${m.alertsConfirmed + m.falseAlarms}건 중 실제 이상 ${m.alertsConfirmed}건</div></div>
        </div>
        <h3>한 줄 요약</h3>
        <p>이번 달은 퇴근 후 공기 압축기를 끄는 날이 늘어 조업 외 낭비 전력이 ${num(cut, 0)}% 줄었습니다. 다만 메인 분전반 T상 단자 온도와 열처리로 2호기 송풍기 이상 점수가 함께 오르고 있어, 다음 달에는 두 곳 점검을 먼저 해 주세요.</p>
        <h3>절감 효과 <span class="estimate">추정</span></h3>
        <ul>
          <li>무부하 전력 감소분 ${num(m.idleBeforeKwh - m.idleNowKwh)} kWh × ${D.PRICE_PER_KWH}원 = 약 ${won((m.idleBeforeKwh - m.idleNowKwh) * D.PRICE_PER_KWH)}</li>
          <li>실제 절감액은 다음 달 전기요금 고지서로 다시 확인합니다.</li>
        </ul>
        <h3>안전</h3>
        <ul>
          <li>11/21 02:47 분기회로 3번 '위험' 경보 → 대행업체 현장 확인 결과 단자 탄화 발견, 교체 완료</li>
          <li>11/19 오경보 1건(모터 기동 노이즈)은 AI 기준값에 반영했습니다.</li>
        </ul>
        <h3>다음 달 할 일</h3>
        <ul>${D.todos.map((t) => `<li><b>${t.title}</b> — ${t.desc}</li>`).join('')}</ul>`;
    },
  };

  updateBadge();
  const start = (location.hash || '#home').slice(1);
  openTab(RENDER[start] ? start : 'home');
})();

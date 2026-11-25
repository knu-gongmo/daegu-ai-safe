/*
 * 시연용 가상 데이터
 * 실제 서비스에서는 이 파일 대신 게이트웨이 → AI 플랫폼 API에서 받아온 값을 사용합니다.
 */
(function () {
  // 매번 같은 화면이 나오도록 고정 시드 난수 사용
  let seed = 20261126;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const noise = (amp) => (rand() - 0.5) * 2 * amp;

  const PRICE_PER_KWH = 182;      // 산업용 평균 단가(원/kWh) 가정
  const VOLT = 380, PF = 0.85;    // 3상 380V, 역률 가정
  const kwOf = (amp) => (Math.sqrt(3) * VOLT * amp * PF) / 1000;

  // 10분 간격 하루 144개 지점의 메인 분전반 전류(A)
  function buildDay(type) {
    const pts = [];
    for (let i = 0; i < 144; i++) {
      const h = i / 6;
      let a;
      if (type === 'weekday') {
        if (h < 7.5) a = 13 + noise(1.5);                       // 야간: 압축기·열처리로 무부하
        else if (h < 8.5) a = 13 + (h - 7.5) * 50 + noise(3);   // 출근·기동
        else if (h >= 12 && h < 13) a = 27 + noise(3);          // 점심
        else if (h < 18) a = 66 + noise(9) + (rand() < 0.04 ? 18 : 0);
        else if (h < 18.5) a = 66 - (h - 18) * 80 + noise(3);
        else if (h < 22) a = 24 + noise(2.5);                   // 퇴근 후 압축기·송풍기 계속 가동
        else a = 13 + noise(1.5);
      } else {
        a = (h > 9 && h < 15) ? 21 + noise(2) : 12 + noise(1.5); // 휴일인데 압축기 가동
      }
      a = Math.max(0.4, a);
      // AI(GMM) 상태 판정 결과 - 시연용으로 구간 기준 사용
      const state = a < 5 ? 'off' : a < 36 ? 'idle' : 'prod';
      pts.push({ t: i, h, amp: +a.toFixed(1), state });
    }
    return pts;
  }

  const weekday = buildDay('weekday');
  const holiday = buildDay('holiday');

  const summarize = (pts) => {
    let total = 0, idleOff = 0;
    pts.forEach((p) => {
      const kwh = kwOf(p.amp) / 6;
      total += kwh;
      const offHours = p.h < 8 || p.h >= 18.5;
      if (p.state === 'idle' && offHours) idleOff += kwh;
    });
    return { total, idleOff };
  };

  // 주 차단기 단자 온도 (R, S, T상) - T상 접속부 조임 불량 시나리오
  const temps = { R: [], S: [], T: [] };
  weekday.forEach((p) => {
    const base = 24 + p.amp * 0.22;
    temps.R.push(+(base + noise(0.6)).toFixed(1));
    temps.S.push(+(base + 1.2 + noise(0.6)).toFixed(1));
    temps.T.push(+(base + 4 + p.amp * 0.16 + noise(0.8)).toFixed(1));
  });

  const machines = [
    {
      id: 'press1', name: '프레스 1호기', level: 'ok', score: 14, unbalance: 1.1,
      state: '생산 중', hoursIdle: 2.1,
      trend: [12, 13, 11, 14, 12, 15, 13, 14],
      note: '평소 전류 패턴과 거의 같습니다. 별도 조치가 필요하지 않습니다.',
    },
    {
      id: 'comp', name: '공기 압축기', level: 'warn', score: 29, unbalance: 1.8,
      state: '무부하 운전', hoursIdle: 31.5,
      trend: [22, 24, 23, 25, 27, 26, 28, 29],
      note: '고장 징후보다는 낭비가 문제입니다. 퇴근 후와 휴일에 생산 없이 돌아간 시간이 지난주 31.5시간입니다.',
    },
    {
      id: 'furnace2', name: '열처리로 2호기 송풍기', level: 'warn', score: 63, unbalance: 4.8,
      state: '생산 중', hoursIdle: 6.0,
      trend: [18, 21, 24, 30, 38, 47, 55, 63],
      note: '이상 점수가 4주 연속 올랐고 3상 불평형도 4.8%로 커졌습니다. 송풍 모터 베어링이나 권선 점검을 권합니다.',
    },
    {
      id: 'cnc', name: 'CNC 선반', level: 'ok', score: 9, unbalance: 0.7,
      state: '꺼짐', hoursIdle: 0.8,
      trend: [10, 9, 11, 8, 10, 9, 8, 9],
      note: '정상 범위입니다.',
    },
  ];

  const alerts = [
    { id: 1, lv: 'warn', cat: '화재', title: '메인 분전반 T상 단자 온도 상승',
      desc: '부하가 걸릴 때 T상 단자가 R·S상보다 10°C 이상 높습니다. 접속부 조임 불량 가능성. 아크 신호는 없어 \'주의\' 등급입니다.',
      time: '오늘 14:20', result: null },
    { id: 2, lv: 'warn', cat: '고장', title: '열처리로 2호기 송풍기 이상 점수 63',
      desc: '최근 4주 연속 상승(18 → 63). 3상 불평형 4.8%.',
      time: '오늘 09:05', result: null },
    { id: 3, lv: 'info', cat: '에너지', title: '퇴근 후 공기 압축기 무부하 운전',
      desc: '어제 18:30~22:00 생산 없이 가동. 약 18kWh(약 3,300원) 낭비 추정.',
      time: '어제 22:10', result: null },
    { id: 4, lv: 'bad', cat: '화재', title: '분기회로 3번 아크 신호 + 온도 급상승',
      desc: '아크 패턴과 온도 상승이 함께 확인되어 \'위험\' 등급. 관리자·대행업체에 즉시 알림, 소방에 위치·등급 통보.',
      time: '11/21 02:47', result: 'confirmed' },
    { id: 5, lv: 'warn', cat: '화재', title: '분기회로 1번 아크 의심 신호',
      desc: '아크 유사 패턴이 감지됐으나 온도 변화 없음. 모터 기동 노이즈일 가능성.',
      time: '11/19 08:31', result: 'false' },
    { id: 6, lv: 'info', cat: '에너지', title: '일요일 공기 압축기 가동',
      desc: '휴무일 09:00~15:00 가동. 약 31kWh(약 5,600원) 낭비 추정.',
      time: '11/23 15:05', result: null },
  ];

  const arcLog = [
    { time: '11/21 02:47', where: '분기회로 3번', temp: '+11°C', lv: 'bad', result: '현장 확인: 단자 탄화 발견, 교체 완료' },
    { time: '11/19 08:31', where: '분기회로 1번', temp: '변화 없음', lv: 'warn', result: '현장 확인: 이상 없음(오경보)' },
  ];

  const todos = [
    { title: '퇴근할 때 공기 압축기 끄기', desc: '지난주 퇴근 후·휴일에 생산 없이 31.5시간 가동, 약 210kWh(약 3만 8천 원) 낭비 추정. 끄기만 해도 한 달 약 15만 원을 아낄 수 있습니다.' },
    { title: '메인 분전반 T상 단자 조임 점검', desc: '부하가 걸릴 때 다른 상보다 10°C 이상 뜨겁습니다. 전기안전 대행업체 방문(11/28)에 점검 요청이 등록되어 있습니다.' },
    { title: '열처리로 2호기 송풍 모터 점검', desc: '이상 점수가 4주째 오르고 있습니다(18 → 63). 다음 휴무일에 베어링·권선 점검을 권합니다.' },
  ];

  window.DEMO = {
    factory: { name: '성서산단 ○○금속 (가상)', meta: '열처리 · 종사자 14명 · 센서 설치 2026.05.12', },
    PRICE_PER_KWH, kwOf,
    days: { weekday, holiday },
    summary: { weekday: summarize(weekday), holiday: summarize(holiday) },
    temps, machines, alerts, arcLog, todos,
    month: {
      label: '2026년 11월', usageKwh: 18240, lastYearKwh: 19110, billWon: 3319680,
      idleBeforeKwh: 2410, idleNowKwh: 1960, alertsTotal: 9, alertsConfirmed: 6, falseAlarms: 2,
    },
  };
})();

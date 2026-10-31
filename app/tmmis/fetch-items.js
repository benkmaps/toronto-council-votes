/*
 * Downloads agenda-item details and motion text from TMMIS for every item in refs.json.
 *
 * Run it from the browser console while on https://secure.toronto.ca/council/
 * (no login is needed). See README.md in this folder for the steps.
 *
 * For each item it makes two requests (the item's details, and its "Agenda Item History"
 * page, which holds the motions and exact vote times), one item at a time with a short
 * pause between them, and saves the results to your Downloads folder in numbered parts
 * (tmmis-items-0001.json, ...).
 */
;(async () => {
  const DELAY_MS = 200 // pause between items
  const PART_SIZE = 500 // items per downloaded file
  const API = '/council/api/multiple/agenda-items.json?pageNumber=0&pageSize=50&sortOrder=meetingDate%20desc,referenceSort'
  const PAGE = '/council/agenda-item.do?item='

  if (location.hostname !== 'secure.toronto.ca') {
    alert('Open https://secure.toronto.ca/council/ first, then run this script there.')
    return
  }
  if (window.__tmmisPanel) window.__tmmisPanel.remove()

  const token = () => {
    const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : ''
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()

  // --- parsing the Agenda Item History page ------------------------------------------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  const pad = (n) => String(n).padStart(2, '0')

  function parseStamp(s) {
    const m = clean(s).match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/i)
    if (!m) return { date: null, time: null }
    let h = Number(m[4]) % 12
    if (/pm/i.test(m[6])) h += 12
    return { date: `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`, time: `${pad(h)}:${m[5]}` }
  }

  // "1a - Motion to Amend Item (Additional) moved by Councillor X (Carried)"
  function parseMotionHead(raw) {
    let t = clean(raw)
    let n = null
    const nm = t.match(/^(\w+) - (.*)$/)
    if (nm) {
      n = nm[1]
      t = nm[2]
    }
    let status = ''
    const sm = t.match(/\s*\(([^()]+)\)\s*$/)
    if (sm && (/ moved by /.test(t) || sm[1] !== 'Additional')) {
      status = sm[1]
      t = t.slice(0, sm.index)
    }
    let mover = ''
    const mm = t.match(/^(.*?) moved by (.*)$/)
    if (mm) {
      t = mm[1]
      mover = mm[2]
    }
    return { n, type: t, mover, status }
  }

  function parseHistory(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const sections = []
    const motions = []
    let body = ''
    let cur = null
    doc.querySelectorAll('h2, div.italics, h4.vote-table-header').forEach((e) => {
      if (e.tagName === 'H2') {
        const m = clean(e.textContent).match(/^(.*?) consideration on (.*)$/)
        if (m) {
          body = m[1]
          sections.push({ body, when: m[2] })
        }
        return
      }
      if (e.tagName === 'DIV') {
        const h = parseMotionHead(e.textContent)
        if (!/^Motion/i.test(h.type)) return // points of order, rulings
        const w = e.nextElementSibling
        cur = { body, ...h, text: w && w.classList.contains('wep') ? w.innerHTML : '', votes: [] }
        motions.push(cur)
        return
      }
      if (!cur) return
      const small = e.querySelector('small')
      const tbl = e.nextElementSibling
      const ths = tbl ? tbl.querySelectorAll('th') : []
      cur.votes.push({
        ...parseStamp(small && small.textContent),
        type: clean((e.querySelector('.normal-text') || {}).textContent).replace(/^\(|\)$/g, ''),
        desc: clean(ths[1] && ths[1].textContent),
        result: clean(ths[0] && ths[0].textContent).replace(/^Result:\s*/, ''),
      })
    })
    return { sections, motions }
  }

  // --- small control panel -----------------------------------------------------------
  const panel = document.createElement('div')
  window.__tmmisPanel = panel
  panel.style.cssText =
    'position:fixed;z-index:999999;right:16px;bottom:16px;width:340px;padding:14px;border-radius:10px;' +
    'background:#fff;color:#111;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);border:1px solid #888'
  panel.innerHTML =
    '<b>TMMIS item downloader</b><div id="tm-msg" style="margin:8px 0">Choose <code>refs.json</code> to begin.</div>' +
    '<input id="tm-file" type="file" accept=".json" style="display:block;margin-bottom:8px;max-width:100%">' +
    '<label>Start at item # <input id="tm-start" type="number" value="0" min="0" style="width:90px"></label> ' +
    '<button id="tm-go" style="margin-left:6px" disabled>Start</button> <button id="tm-stop" disabled>Stop</button>' +
    '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #ccc"><button id="tm-council" disabled>Download council item list</button>' +
    '<div style="font-size:12px;color:#555;margin:4px 0 8px">Step 2: council items that had no recorded vote. Quick (about 60 requests).</div>' +
    '<button id="tm-committees" disabled>Download committee item lists</button>' +
    '<div style="font-size:12px;color:#555;margin-top:4px">Step 3: the same for committees and community councils (a few minutes).</div></div>'
  document.body.appendChild(panel)
  const $ = (id) => panel.querySelector(id)
  const say = (t) => ($('#tm-msg').innerHTML = t)

  let refs = []
  let councilRefs = []
  let councilTerms = null
  let bodyRefs = null // { term: { bodyName: [refs voted there] } }
  let stop = false
  $('#tm-file').onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text())
      refs = Array.isArray(j) ? j : j.items
      councilRefs = Array.isArray(j) ? [] : j.council
      councilTerms = Array.isArray(j) ? null : j.terms || null // null = every term
      bodyRefs = Array.isArray(j) ? null : j.bodies || null
      say(`${refs.length.toLocaleString()} items loaded. Press <b>Start</b>.`)
      $('#tm-go').disabled = false
      $('#tm-council').disabled = false
      $('#tm-committees').disabled = !bodyRefs
    } catch {
      say('That file could not be read. Pick <code>refs.json</code>.')
    }
  }
  $('#tm-stop').onclick = () => {
    stop = true
    say('Stopping after the current item...')
  }

  const download = (name, data) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  const slim = (r) => ({
    body: r.decisionBodyName,
    date: r.meetingDate ? new Date(r.meetingDate).toISOString().slice(0, 10) : null,
    num: r.meetingNumber,
    status: r.itemStatus,
    title: r.agendaItemTitle,
    summary: r.agendaItemSummary,
    recommendation: r.agendaItemRecommendation,
    decision: r.decisionRecommendations,
    advice: r.decisionAdvice,
    subjects: r.subjectTerms,
  })

  // POST/GET with retry. Throws {fatal:true} if TMMIS refuses us, so we stop politely.
  async function request(url, init, read) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, init())
        if (res.status === 403 || res.status === 429) {
          await fetch('/council/api/csrf.json', { credentials: 'same-origin' }) // refresh token once
          if (attempt >= 1) throw Object.assign(new Error('blocked ' + res.status), { fatal: true })
          await sleep(5000)
          continue
        }
        if (res.status === 404) return null
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return await read(res)
      } catch (err) {
        if (err.fatal || attempt === 3) throw err
        await sleep(2000 * (attempt + 1))
      }
    }
  }

  async function fetchRef(ref) {
    const records = await request(
      API,
      () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token() },
        body: JSON.stringify({ text: ref }),
      }),
      async (res) => ((await res.json()).Records || []).filter((r) => r.reference === ref).map(slim),
    )
    await sleep(DELAY_MS)
    const history = await request(
      PAGE + encodeURIComponent(ref),
      () => ({ credentials: 'same-origin' }),
      async (res) => parseHistory(await res.text()),
    )
    return { records: records || [], history }
  }

  // --- step 2: every City Council item, so ones with no recorded vote can be shown ----------
  const cap = (s) => (s && s.length > 5000 ? s.slice(0, 5000) + '…' : s || '')

  async function downloadCouncilList() {
    $('#tm-council').disabled = true
    $('#tm-go').disabled = true
    $('#tm-stop').disabled = false
    stop = false
    const voted = new Set(councilRefs)
    try {
      const bodies = await request(
        '/council/api/multiple/common/findPostedDecisionBodiesByTerm.json',
        () => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token() }, body: '{}' }),
        async (res) => (await res.json()).Records || [],
      )
      const councils = bodies
        .map((b) => ({ id: b.decisionBodyId, term: (b.decisionBodyName.match(/^City Council \((\d{4}-\d{4})\)$/) || [])[1] }))
        .filter((b) => b.term && (!councilTerms || councilTerms.includes(b.term)))
      for (const body of councils) {
        const list = []
        const seen = new Set()
        for (let page = 0, pages = 1; page < pages && !stop; page++) {
          say(`Council ${body.term}: page ${page + 1} of ${pages}`)
          const j = await request(
            `/council/api/multiple/agenda-items.json?pageNumber=${page}&pageSize=500&sortOrder=meetingDate%20desc,referenceSort`,
            () => ({
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token() },
              body: JSON.stringify({ decisionBodyId: body.id }),
            }),
            (res) => res.json(),
          )
          pages = j.TotalPages || 1
          for (const r of j.Records || []) {
            if (seen.has(r.id)) continue
            seen.add(r.id)
            const date = r.meetingDate ? new Date(r.meetingDate).toISOString().slice(0, 10) : null
            // items with a recorded council vote: only the meeting link is needed
            if (voted.has(r.reference)) list.push({ r: r.reference, mid: r.meetingId, d: date })
            else
              list.push({
                r: r.reference, mid: r.meetingId, d: date, n: r.meetingNumber, st: r.itemStatus, t: r.agendaItemTitle,
                s: cap(r.agendaItemSummary), rec: cap(r.agendaItemRecommendation), x: cap(r.decisionRecommendations), k: r.subjectTerms,
              })
          }
          await sleep(500)
        }
        if (stop) break
        download(`tmmis-council-${body.term}.json`, list)
      }
      say(stop ? 'Stopped.' : '<b>Council list done!</b> Move the tmmis-council-*.json files into <code>app/tmmis/parts</code>.')
    } catch (err) {
      say(`<b>Stopped</b>: ${err.message}. Wait a while and run this step again.`)
    }
    $('#tm-council').disabled = false
    $('#tm-go').disabled = false
    $('#tm-stop').disabled = true
  }
  $('#tm-council').onclick = downloadCouncilList

  // --- step 3: committee and community council items, same idea as step 2 --------------------
  const capN = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '')
  const normName = (s) => (s || '').replace(/\s+/g, ' ').trim()

  // every item considered by one decision body; items already in the vote data keep only a meeting link
  async function listBody(bodyId, voted, label) {
    const list = []
    const seen = new Set()
    const maxPages = window.TMMIS_TEST_MAX_PAGES || Infinity
    for (let page = 0, pages = 1; page < pages && page < maxPages && !stop; page++) {
      say(`${label}: page ${page + 1} of ${pages}`)
      const j = await request(
        `/council/api/multiple/agenda-items.json?pageNumber=${page}&pageSize=500&sortOrder=meetingDate%20desc,referenceSort`,
        () => ({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token() },
          body: JSON.stringify({ decisionBodyId: bodyId }),
        }),
        (res) => res.json(),
      )
      pages = j.TotalPages || 1
      for (const r of j.Records || []) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        const date = r.meetingDate ? new Date(r.meetingDate).toISOString().slice(0, 10) : null
        if (voted.has(r.reference)) list.push({ r: r.reference, mid: r.meetingId, d: date })
        else
          list.push({
            r: r.reference, mid: r.meetingId, d: date, n: r.meetingNumber, cd: r.agendaCd, y: r.termYear, st: r.itemStatus, t: r.agendaItemTitle,
            s: capN(r.agendaItemSummary, 1500), rec: capN(r.agendaItemRecommendation, 1500), x: capN(r.decisionRecommendations, 2500), k: r.subjectTerms,
          })
      }
      await sleep(500)
    }
    return list
  }

  async function downloadCommitteeLists() {
    $('#tm-committees').disabled = true
    $('#tm-council').disabled = true
    $('#tm-go').disabled = true
    $('#tm-stop').disabled = false
    stop = false
    try {
      const bodies = await request(
        '/council/api/multiple/common/findPostedDecisionBodiesByTerm.json',
        () => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': token() }, body: '{}' }),
        async (res) => (await res.json()).Records || [],
      )
      for (const term of Object.keys(bodyRefs).filter((t) => !councilTerms || councilTerms.includes(t))) {
        const wanted = new Map(
          Object.entries(bodyRefs[term])
            .filter(([name]) => normName(name) !== 'City Council')
            .map(([name, refs]) => [normName(name), { name, voted: new Set(refs) }]),
        )
        const out = {}
        for (const b of bodies) {
          const m = b.decisionBodyName.match(/^(.*?)\s*\((\d{4}-\d{4})\)$/)
          if (!m || m[2] !== term) continue
          const want = wanted.get(normName(m[1]))
          if (!want) continue
          out[want.name] = await listBody(b.decisionBodyId, want.voted, `${term} ${want.name}`)
          if (stop) break
        }
        if (stop) break
        download(`tmmis-committees-${term}.json`, out)
      }
      say(stop ? 'Stopped.' : '<b>Committee lists done!</b> Move the tmmis-committees-*.json files into <code>app/tmmis/parts</code>.')
    } catch (err) {
      say(`<b>Stopped</b>: ${err.message}. Wait a while and run this step again.`)
    }
    $('#tm-committees').disabled = false
    $('#tm-council').disabled = false
    $('#tm-go').disabled = false
    $('#tm-stop').disabled = true
  }
  $('#tm-committees').onclick = downloadCommitteeLists

  $('#tm-go').onclick = async () => {
    $('#tm-go').disabled = true
    $('#tm-file').disabled = true
    $('#tm-stop').disabled = false
    stop = false
    const start = Math.max(0, parseInt($('#tm-start').value, 10) || 0)
    let part = {}
    let partNo = Math.floor(start / PART_SIZE) + 1
    const t0 = Date.now()
    let i = start
    try {
      for (; i < refs.length && !stop; i++) {
        part[refs[i]] = await fetchRef(refs[i])
        const done = i - start + 1
        const rate = (Date.now() - t0) / done
        const mins = Math.round(((refs.length - i - 1) * rate) / 60000)
        say(`Item ${i + 1} of ${refs.length}<br>About ${mins} min left. Keep this tab open.`)
        if ((i + 1) % PART_SIZE === 0) {
          download(`tmmis-items-${String(partNo++).padStart(4, '0')}.json`, part)
          part = {}
        }
        await sleep(DELAY_MS)
      }
    } catch (err) {
      say(`<b>Stopped at item ${i}</b>: ${err.message}.<br>Your progress is saved in parts. Restart later with "Start at item #" = ${i - (i % PART_SIZE)}.`)
    }
    if (Object.keys(part).length) download(`tmmis-items-${String(partNo).padStart(4, '0')}.json`, part)
    if (!stop && i >= refs.length) say('<b>Done!</b> Move all the downloaded tmmis-items-*.json files into <code>app/tmmis/parts</code>.')
    else if (stop) say(`Stopped. Restart with "Start at item #" = ${i - (i % PART_SIZE)} (the last partial file was saved).`)
    $('#tm-go').disabled = false
    $('#tm-file').disabled = false
    $('#tm-stop').disabled = true
  }

  // test hook so the script can be exercised without the file picker
  if (Array.isArray(window.TMMIS_TEST_REFS)) {
    window.TMMIS_TEST_RESULT = {}
    for (const r of window.TMMIS_TEST_REFS) window.TMMIS_TEST_RESULT[r] = await fetchRef(r)
  }
})()

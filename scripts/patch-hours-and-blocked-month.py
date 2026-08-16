from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

# booking-drag.js
p = Path('booking-drag.js')
s = p.read_text()
s = replace_once(s, "const DAY_END=23*60;\nconst LAST_VISIBLE_START=22*60+45;", "const DAY_END=22*60;\nconst LAST_VISIBLE_START=21*60+45;", 'drag hours')
s = replace_once(s, "function addQuarterOptions(select){if(!select)return;const opts=[...select.options].filter(o=>o.value);if(opts.length<2)return;const mins=new Set(opts.map(o=>timeToMinutes(o.value))),additions=[];for(const m of[...mins])if(mins.has(m+30)&&!mins.has(m+15))additions.push(m+15);for(const q of additions){const o=document.createElement('option');o.value=minutesToTime(q);o.textContent=minutesToTime(q).slice(0,5);select.appendChild(o)}const all=[...select.options],first=all.shift();all.sort((a,b)=>(a.value||'').localeCompare(b.value||''));select.replaceChildren(first,...all)}", "function addQuarterOptions(select){if(!select)return;const first=[...select.options].find(o=>!o.value)||null,current=select.value;const byValue=new Map([...select.options].filter(o=>o.value&&timeToMinutes(o.value)<22*60).map(o=>[String(o.value).slice(0,5),o]));const all=[];for(let q=DAY_START;q<=LAST_VISIBLE_START;q+=15){const value=minutesToTime(q),key=value.slice(0,5),o=byValue.get(key)||document.createElement('option');o.value=value;o.textContent=key;all.push(o)}select.replaceChildren(...(first?[first]:[]),...all);if(current&&timeToMinutes(current)<22*60)select.value=current}", 'quarter options')
s = replace_once(s, "for(let hour=8;hour<=22;hour++)", "for(let hour=8;hour<=21;hour++)", 'quarter hour groups')
p.write_text(s)

# admin.html
p = Path('admin.html')
s = p.read_text()
s = replace_once(s, "  min-width:1740px;", "  min-width:1680px;", 'timeline width')
s = replace_once(s, "const DAY_END=\n  22*60+30;", "const DAY_END=\n  22*60;", 'admin day end')
s = replace_once(s, "  minutes<=DAY_END;", "  minutes<DAY_END;", 'base times cutoff')
s = replace_once(s, "          DAY_END+30;", "          DAY_END;", 'whole day visual end')
s = replace_once(s, "          end,\n          DAY_END+30", "          end,\n          DAY_END", 'blocked visual clamp')

old_html = '''<p class="muted">\n複数の日付を選択して、同じ時間帯をまとめて予約不可にできます。\n</p>\n\n<div class="weekHeader">'''
new_html = '''<p class="muted">\n複数の日付を選択して、同じ時間帯をまとめて予約不可にできます。\n</p>\n\n<label>予定を一括登録する月</label>\n<div class="row">\n<button class="secondary" id="blockedPrevMonth" type="button">← 前月</button>\n<button class="secondary" id="blockedNextMonth" type="button">翌月 →</button>\n</div>\n<input type="month" id="blockedMonth">\n\n<div class="weekHeader">'''
s = replace_once(s, old_html, new_html, 'blocked month UI')

old_sync = '''  if(\n    !$('month').value\n  ){\n\n    $('month').value=\n      monthFromDate(\n        $('date').value\n      );\n  }\n\n\n  if(\n    !$('adminBookingDate').value'''
new_sync = '''  if(\n    !$('month').value\n  ){\n\n    $('month').value=\n      monthFromDate(\n        $('date').value\n      );\n  }\n\n\n  if(\n    !$('blockedMonth').value\n  ){\n\n    $('blockedMonth').value=\n      monthFromDate(\n        $('date').value\n      );\n  }\n\n\n  if(\n    !$('adminBookingDate').value'''
s = replace_once(s, old_sync, new_sync, 'blocked month init')

old_date = '''  $('month').value=\n    monthFromDate(\n      $('date').value\n    );\n\n\n  $('adminBookingDate').value='''
new_date = '''  $('month').value=\n    monthFromDate(\n      $('date').value\n    );\n\n\n  $('blockedMonth').value=\n    monthFromDate(\n      $('date').value\n    );\n\n\n  $('adminBookingDate').value='''
s = replace_once(s, old_date, new_date, 'date sync blocked month')

old_month_handler = '''$('month').onchange=\nasync()=>{\n\n  selectedBlockedDates=\n    new Set();\n\n\n  renderDaySelector();\n\n  await loadMonthBlockedTimes();\n};'''
new_month_handler = '''$('month').onchange=\nasync()=>{\n  // OPEN/CLOSEの対象月だけを切り替えます。予定一括の月は独立して保持します。\n};\n\n\n$('blockedMonth').onchange=\nasync()=>{\n  selectedBlockedDates=new Set();\n  renderDaySelector();\n  await loadMonthBlockedTimes();\n};\n\n\nfunction shiftBlockedMonth(delta){\n  const base=$('blockedMonth').value||monthFromDate($('date').value)||monthFromDate(todayJapan());\n  const [year,mon]=base.split('-').map(Number);\n  const d=new Date(Date.UTC(year,mon-1+delta,1));\n  $('blockedMonth').value=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;\n  $('blockedMonth').dispatchEvent(new Event('change',{bubbles:true}));\n}\n\n$('blockedPrevMonth').onclick=()=>shiftBlockedMonth(-1);\n$('blockedNextMonth').onclick=()=>shiftBlockedMonth(1);'''
s = replace_once(s, old_month_handler, new_month_handler, 'month handlers')

# Only the blocked-date selector and blocked-list loader should use blockedMonth.
s = replace_once(s, "function renderDaySelector(){\n\n  const month=\n    $('month').value;", "function renderDaySelector(){\n\n  const month=\n    $('blockedMonth').value;", 'selector month')
s = replace_once(s, "async function loadMonthBlockedTimes(){\n\n  const month=\n    $('month').value;", "async function loadMonthBlockedTimes(){\n\n  const month=\n    $('blockedMonth').value;", 'blocked list month')

old_selected = "    `選択中：${dates.map(x=>Number(x.slice(-2))+'日').join('・')}`"
new_selected = "    `選択中：${dates.map(x=>Number(x.slice(5,7))+'月'+Number(x.slice(-2))+'日').join('・')}`"
s = replace_once(s, old_selected, new_selected, 'selected date label')

# LINE-link return flow: keep both month controls in sync with the restored date.
old_resume = "  $('month').value=\n    monthFromDate(\n      payload.p_date\n    );"
new_resume = "  $('month').value=\n    monthFromDate(\n      payload.p_date\n    );\n\n\n  $('blockedMonth').value=\n    monthFromDate(\n      payload.p_date\n    );"
s = replace_once(s, old_resume, new_resume, 'resume month sync')

p.write_text(s)

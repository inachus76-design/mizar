const management = document.getElementById('management');
const toolList = document.getElementById('tool-list');
const toolEmpty = document.getElementById('tool-empty');
const manager = document.getElementById('manager');
const result = document.getElementById('manager-status');
management.querySelector('summary').textContent = '교실 도구 관리';
manager.innerHTML = `
  <p class="tool-guide">손잡이를 끌어 순서를 바꾸세요. 키보드는 손잡이에서 위·아래 방향키를 사용하세요.</p>
  <ol class="tool-edit-list" aria-label="교실 도구 편집 목록"></ol>
  <fieldset class="tool-edit-fields">
    <legend>도구 추가 / 수정</legend>
    <div class="tool-fields">
      <label>아이콘 <input name="icon" maxlength="16" placeholder="✦"></label>
      <label>도구 이름 <input name="title" maxlength="60" placeholder="예: 우리 반 타이머"></label>
    </div>
    <label>설명 <input name="description" maxlength="160" placeholder="예: 수업 시간을 함께 지켜요"></label>
    <label>도구 링크 · 선택 <input name="url" type="url" maxlength="1500" placeholder="https://… (비우면 준비 중)"></label>
    <div class="tool-edit-actions"><button type="button" data-stage>목록에 추가</button><button type="button" data-cancel hidden>수정 취소</button></div>
  </fieldset>
  <label>관리자 비밀번호 <input name="code" type="password" maxlength="128" autocomplete="off" placeholder="배경음악 변경과 같은 비밀번호" required></label>
  <div class="tool-edit-actions"><button type="submit">전체 저장</button><button type="button" data-close>닫기</button></div>`;
const editList = manager.querySelector('ol');
const stage = manager.querySelector('[data-stage]');
const cancelEdit = manager.querySelector('[data-cancel]');
let draft = [];
let baseTools = [];
let dirty = false;
let editing = null;
let savingTools = false;

function editTool(tool = null) {
  editing = tool;
  manager.elements.icon.value = tool?.icon ?? '';
  manager.elements.title.value = tool?.name ?? '';
  manager.elements.description.value = tool?.description ?? '';
  manager.elements.url.value = tool?.url ?? '';
  stage.textContent = tool ? '목록에 수정 반영' : '목록에 추가';
  cancelEdit.hidden = !tool;
}

function moveTool(from, to) {
  if (from === to || to < 0 || to >= draft.length || savingTools) return;
  draft.splice(to, 0, draft.splice(from, 1)[0]);
  dirty = true;
  renderDraft();
  editList.children[to].querySelector('.tool-handle').focus();
  result.textContent = (to + 1) + '번째로 옮겼습니다. 전체 저장을 눌러 주세요.';
}

function renderDraft() {
  editList.replaceChildren();
  draft.forEach((tool, index) => {
    const row = document.createElement('li');
    row.dataset.index = String(index);
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'tool-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', tool.name + ' 순서 이동');
    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      moveTool(index, index + (event.key === 'ArrowUp' ? -1 : 1));
    });
    const rowAt = event => document.elementFromPoint(event.clientX, event.clientY)?.closest('.tool-edit-list > li');
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || savingTools) return;
      handle.setPointerCapture(event.pointerId);
      row.classList.add('moving');
    });
    handle.addEventListener('pointermove', event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const bounds = editList.getBoundingClientRect();
      if (event.clientY > Math.min(bounds.bottom, innerHeight) - 28) window.scrollBy(0, 16);
      else if (event.clientY < Math.max(bounds.top, 0) + 28) window.scrollBy(0, -16);
      editList.querySelector('.drop-target')?.classList.remove('drop-target');
      const target = rowAt(event);
      if (target && target !== row) target.classList.add('drop-target');
    });
    handle.addEventListener('lostpointercapture', () => {
      row.classList.remove('moving');
      editList.querySelector('.drop-target')?.classList.remove('drop-target');
    });
    handle.addEventListener('pointerup', event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const target = rowAt(event);
      if (target) moveTool(index, Number(target.dataset.index));
    });
    const label = document.createElement('strong');
    label.textContent = (tool.icon || '✦') + ' ' + tool.name;
    const actions = document.createElement('div');
    actions.className = 'tool-edit-actions';
    for (const [text, run] of [
      ['수정', () => { editTool(tool); manager.elements.title.focus(); }],
      ['삭제', () => {
        if (savingTools) return;
        if (editing === tool) editTool();
        draft.splice(index, 1);
        dirty = true;
        renderDraft();
        result.textContent = '목록에서 제거했습니다. 전체 저장을 눌러 주세요.';
      }]
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-label', tool.name + ' ' + text);
      button.addEventListener('click', run);
      actions.append(button);
    }
    row.append(handle, label, actions);
    editList.append(row);
  });
}

stage.addEventListener('click', () => {
  if (savingTools) return;
  const name = manager.elements.title.value.trim();
  const url = manager.elements.url.value.trim();
  if (!name) {
    result.textContent = '도구 이름을 입력해 주세요.';
    manager.elements.title.focus();
    return;
  }
  if (url && (!manager.elements.url.checkValidity() || !url.startsWith('https://'))) {
    result.textContent = '도구 링크는 HTTPS 주소로 입력해 주세요.';
    manager.elements.url.focus();
    return;
  }
  if (!editing && draft.length >= 100) {
    result.textContent = '도구는 최대 100개까지 등록할 수 있습니다.';
    return;
  }
  const fields = { name, url, icon: manager.elements.icon.value.trim() || '✦', description: manager.elements.description.value.trim() };
  if (editing) Object.assign(editing, fields);
  else draft.push({ id: null, ...fields });
  dirty = true;
  renderDraft();
  editTool();
  result.textContent = '목록에 반영했습니다. 전체 저장을 눌러 주세요.';
});
cancelEdit.addEventListener('click', () => editTool());
manager.querySelector('[data-close]').addEventListener('click', () => {
  management.open = false;
  management.querySelector('summary').focus();
});

const toolStyle = document.createElement('style');
toolStyle.textContent = `
#tool-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
#tool-list:empty{display:none}
#tool-list .tool-card{display:flex;min-width:0;min-height:154px;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:15px 10px;text-align:center;background:#f5f7ee;border:1px dashed #aeb99d;border-radius:13px;color:#485640;text-decoration:none;overflow-wrap:anywhere}
#tool-list a.tool-card:hover{background:#ebf0df;border-color:#78896c}
.tool-card-icon{font-size:29px;line-height:1.15}
.tool-card-name{font-size:16px}
.tool-card-description,.tool-card-pending{font-size:13px;color:#5d6853}
#manager {gap:12px}
#manager .tool-guide{margin:0;background:#eee8f6;border-radius:9px;padding:10px 12px;font-size:14px}
.tool-edit-list{list-style:none;padding:0;margin:0}
.tool-edit-list li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px 0;border-bottom:1px dashed #d5c7de;overflow-wrap:anywhere}
.tool-edit-list li.moving{opacity:.65}
.tool-edit-list li.drop-target{background:#eee7f7}
#manager button{font:inherit;border:1px solid #cbbad7;border-radius:7px;color:#5d4b68;background:#f2edf7;padding:6px 9px;cursor:pointer}
#manager button[type=submit]{background:#e4d7f0;font-weight:bold}
#manager .tool-handle{touch-action:none;cursor:grab;min-width:35px;min-height:40px;font-size:20px;padding:0}
#manager .tool-handle:active{cursor:grabbing}
.tool-edit-actions{display:flex;gap:6px;flex-wrap:wrap}
.tool-edit-fields{min-width:0;margin:0;padding:9px 12px 12px;border:1px dashed #aeb99d;border-radius:10px;background:#f5f7ee;display:grid;gap:8px}
#manager .tool-fields{display:grid;grid-template-columns:66px minmax(0,1fr);gap:8px}
@media(max-width:850px){#tool-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:390px){#tool-list{grid-template-columns:1fr}}
`;
document.head.append(toolStyle);

const playerAudio = document.getElementById('audio');
let settings = { tools: [], bgm: null };
let appliedMusic = null;
let stoppedByVisitor = false;
let awaitingGesture = false;
playerAudio.loop = true;

const stopMusic = document.createElement('button');
stopMusic.type = 'button';
stopMusic.className = 'submit';
stopMusic.textContent = '정지';
stopMusic.style.marginTop = '6px';
stopMusic.disabled = true;
const musicStatus = document.getElementById('music-status');
musicStatus.before(stopMusic);

stopMusic.addEventListener('click', () => {
  stoppedByVisitor = true;
  awaitingGesture = false;
  playerAudio.pause();
  if (playerAudio.readyState > 0) playerAudio.currentTime = 0;
});
document.getElementById('play').addEventListener('click', () => {
  stoppedByVisitor = true;
  awaitingGesture = false;
});
playerAudio.addEventListener('playing', () => { stopMusic.disabled = false; });
playerAudio.addEventListener('error', () => { stopMusic.disabled = true; });

async function tryAutoplay() {
  if (stoppedByVisitor || !appliedMusic) return;
  awaitingGesture = false;
  const source = appliedMusic;
  try {
    await playerAudio.play();
  } catch (error) {
    if (error.name === 'NotAllowedError' && !stoppedByVisitor && source === appliedMusic) {
      awaitingGesture = true;
      if (playerAudio.readyState > 0) musicStatus.textContent = '화면을 한 번 누르면 음악이 시작됩니다.';
    }
  }
}
function resumeOnGesture(event) {
  if (!awaitingGesture || !event.isTrusted || event.target.closest('button, input, select, textarea, summary, label')) return;
  if (event.type === 'keydown' && (event.repeat || event.ctrlKey || event.altKey || event.metaKey)) return;
  void tryAutoplay();
}
document.addEventListener('click', resumeOnGesture);
document.addEventListener('keydown', resumeOnGesture);

const musicManager = document.createElement('details');
musicManager.style.marginTop = '10px';
musicManager.hidden = true;
musicManager.innerHTML = `
  <summary style="cursor:pointer;color:var(--purple);font-size:14px">BGM 관리</summary>
  <form style="margin-top:8px">
    <label>음원 파일 <input name="audioFile" type="file" accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"></label>
    <p style="font-size:13px;margin:0;color:var(--muted)">MP3·WAV·OGG, 최대 8MB</p>
    <label>또는 음원 주소 <input name="url" type="url" maxlength="1500" placeholder="https://…/music.mp3"></label>
    <label>관리번호 <input name="code" type="password" maxlength="128" autocomplete="off" required></label>
    <button type="submit" class="submit">BGM 추가</button>
    <button type="submit" class="submit" name="remove" formnovalidate hidden>BGM 삭제</button>
  </form>
  <p role="status" style="font-size:14px;margin:5px 0 0;color:var(--muted)"></p>`;
document.getElementById('music-status').after(musicManager);
const musicForm = musicManager.querySelector('form');
const musicSave = musicForm.querySelector('button');
const musicRemove = musicForm.elements.remove;
const musicResult = musicManager.querySelector('[role=status]');

function renderSettings(data) {
  settings = data;
  toolList.replaceChildren();

  for (const tool of data.tools) {
    const card = document.createElement(tool.url ? 'a' : 'article');
    card.className = 'tool-card';
    if (tool.url) {
      card.href = tool.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    }
    const icon = document.createElement('span');
    icon.className = 'tool-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tool.icon || '✦';
    const name = document.createElement('strong');
    name.className = 'tool-card-name';
    name.textContent = tool.name;
    card.append(icon, name);
    if (tool.description || !tool.url) {
      const detail = document.createElement('span');
      detail.className = 'tool-card-description';
      detail.textContent = tool.description || '준비 중';
      card.append(detail);
    }
    if (!tool.url && tool.description) {
      const pending = document.createElement('small');
      pending.className = 'tool-card-pending';
      pending.textContent = '준비 중';
      card.append(pending);
    }
    toolList.append(card);

  }
  toolEmpty.hidden = data.tools.length > 0;
  if (appliedMusic !== data.bgm) {
    appliedMusic = data.bgm;
    awaitingGesture = false;
    stopMusic.disabled = true;
    playerAudio.pause();
    if (data.bgm) {
      document.getElementById('music-status').textContent = '음악 확인 중…';
      playerAudio.src = data.bgm;
      playerAudio.load();
      stopMusic.disabled = false;
      void tryAutoplay();
    } else if (data.bgm === '') {
      playerAudio.removeAttribute('src');
      playerAudio.load();
      document.getElementById('play').disabled = true;
      document.getElementById('seek').disabled = true;
      document.getElementById('music-status').textContent = '배경음악이 꺼져 있습니다.';
    }
  }
  musicForm.elements.url.value = data.bgm?.startsWith('/api/site-settings?audio=') ? '' : data.bgm ?? '';
  musicSave.textContent = data.bgm ? 'BGM 수정' : 'BGM 추가';
  musicRemove.hidden = !data.bgm;
  if (!dirty) {
    baseTools = data.tools;
    draft = data.tools.map(tool => ({ ...tool }));
    renderDraft();
  }
}

manager.addEventListener('submit', async event => {
  event.preventDefault();
  if (savingTools) return;
  if (editing || manager.elements.title.value.trim()) {
    result.textContent = '입력 중인 도구를 먼저 목록에 추가하거나 수정 반영해 주세요.';
    return;
  }
  if (!dirty) { result.textContent = '저장할 변경 사항이 없습니다.'; return; }
  const button = manager.querySelector('[type=submit]');
  savingTools = button.disabled = true;
  const code = manager.elements.code.value.trim();
  manager.elements.code.value = '';
  try {
    const response = await fetch('/api/site-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveTools', code, tools: draft, baseTools })
    });
    const data = await response.json();
    if (!response.ok) {
      result.textContent = ({
        code: '관리자 비밀번호를 확인해 주세요.',
        conflict: '다른 곳에서 목록이 바뀌었습니다. 새로고침한 뒤 다시 편집해 주세요.',
        input: '도구 이름, 설명, 링크를 확인해 주세요.'
      })[data.error] || '목록을 저장하지 못했습니다.';
      return;
    }
    dirty = false;
    editTool();
    renderSettings(data);
    result.textContent = '전체 목록을 저장했습니다.';
  } catch { result.textContent = '목록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  finally { savingTools = button.disabled = false; }
});

musicForm.addEventListener('submit', async event => {
  event.preventDefault();
  const removing = event.submitter === musicRemove;
  if (!musicForm.elements.code.reportValidity()) return;
  const file = removing ? null : musicForm.elements.audioFile.files[0];
  const url = removing ? '' : musicForm.elements.url.value.trim();
  const type = file && ({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' })[file.name.split('.').pop().toLowerCase()];
  if (file && (!type || file.size > 8 * 1024 * 1024)) {
    musicResult.textContent = '8MB 이하의 MP3·WAV·OGG 파일을 선택해 주세요.';
    return;
  }
  if (!removing && !file && !url.startsWith('https://')) {
    musicResult.textContent = 'HTTPS로 시작하는 직접 재생 가능한 음원 주소를 입력해 주세요.';
    return;
  }
  if (removing && !window.confirm('등록한 배경음악을 삭제할까요?')) return;
  musicSave.disabled = musicRemove.disabled = true;
  const code = musicForm.elements.code.value.trim();
  musicForm.elements.code.value = '';
  try {
    const response = await fetch(file ? '/api/site-settings?upload' : '/api/site-settings', {
      method: 'POST',
      headers: file ? { 'Content-Type': type, 'X-Admin-Code-Encoded': encodeURIComponent(code) } : { 'Content-Type': 'application/json' },
      body: file || JSON.stringify({ action: 'music', url, code })
    });
    const data = await response.json();
    if (!response.ok) {
      musicResult.textContent = ({
        code: '관리번호를 다시 확인해 주세요.',
        setup: 'Cloudflare에 관리번호 설정이 필요합니다.',
        input: '재생 가능한 HTTPS 음원 주소를 확인해 주세요.',
        format: 'MP3·WAV·OGG 음원 파일을 확인해 주세요.',
        size: '음원 파일은 8MB까지 올릴 수 있습니다.'
      })[data.error] || '변경 사항을 저장하지 못했습니다.';
      return;
    }
    renderSettings(data);
    musicForm.elements.audioFile.value = '';
    musicResult.textContent = removing ? '배경음악을 삭제했습니다.' : '배경음악을 저장했습니다. 재생 버튼을 눌러 확인해 주세요.';
  } catch {
    musicResult.textContent = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    musicSave.disabled = musicRemove.disabled = false;
  }
});

fetch('/api/site-settings').then(response => {
  if (!response.ok) throw new Error('Could not load settings');
  return response.json();
}).then(data => {
  renderSettings(data);
  management.hidden = false;
  musicManager.hidden = false;
}).catch(() => { toolEmpty.textContent = '교실 도구를 불러오지 못했습니다.'; });

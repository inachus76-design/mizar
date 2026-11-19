const management = document.getElementById('management');
const toolList = document.getElementById('tool-list');
const toolEmpty = document.getElementById('tool-empty');
const manager = document.getElementById('manager');
const result = document.getElementById('manager-status');
const actionField = manager.elements.action;
const toolField = manager.elements.tool;
const toolCode = manager.elements.code;
toolCode.removeAttribute('pattern');
toolCode.removeAttribute('inputmode');
toolCode.maxLength = 128;
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

function syncForm() {
  const action = actionField.value;
  const tool = settings.tools.find(item => item.id === Number(toolField.value));
  const selecting = action === 'edit' || action === 'delete';
  manager.querySelector('[data-selection]').hidden = !selecting;
  manager.querySelector('[data-name]').hidden = action === 'music' || action === 'delete';
  manager.querySelector('[data-url]').hidden = action === 'delete';
  manager.querySelector('[data-url-text]').textContent = action === 'music' ? '음원 주소 (비우면 끄기)' : '도구 주소';
  manager.elements.title.required = action === 'add' || action === 'edit';
  manager.elements.url.required = action === 'add' || action === 'edit';
  toolField.required = selecting;
  manager.elements.title.value = action === 'edit' ? tool?.name ?? '' : '';
  manager.elements.url.value = action === 'music' ? settings.bgm ?? '' : action === 'edit' ? tool?.url ?? '' : '';
  manager.querySelector('button').textContent = action === 'delete' ? '삭제' : '저장';
}

function renderSettings(data) {
  settings = data;
  toolList.replaceChildren();
  toolField.replaceChildren(new Option('도구를 선택하세요', ''));
  for (const tool of data.tools) {
    const link = document.createElement('a');
    link.href = tool.url;
    link.textContent = tool.name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    toolList.append(link);
    toolField.add(new Option(tool.name, String(tool.id)));
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
  syncForm();
}

actionField.addEventListener('change', syncForm);
toolField.addEventListener('change', syncForm);
manager.addEventListener('submit', async event => {
  event.preventDefault();
  const action = actionField.value;
  if (action === 'delete' && !window.confirm('선택한 교실 도구 링크를 삭제할까요?')) return;
  const button = manager.querySelector('button');
  button.disabled = true;
  const payload = {
    action, id: Number(toolField.value), name: manager.elements.title.value,
    url: manager.elements.url.value.trim(), code: manager.elements.code.value.trim()
  };
  manager.elements.code.value = '';
  try {
    const response = await fetch('/api/site-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      result.textContent = ({ code: '관리번호를 다시 확인해 주세요.', setup: 'Cloudflare에서 관리번호를 먼저 설정해 주세요.', input: '이름과 HTTPS 주소를 확인해 주세요.', missing: '도구가 이미 삭제되었거나 변경되었습니다.', limit: '교실 도구는 최대 100개까지 등록할 수 있습니다.' })[data.error] || '변경 사항을 저장하지 못했습니다.';
      return;
    }
    renderSettings(data);
    result.textContent = action === 'delete' ? '삭제했습니다.' : '저장했습니다.';
  } catch { result.textContent = '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  finally { button.disabled = false; }
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

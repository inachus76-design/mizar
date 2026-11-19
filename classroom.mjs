const management = document.getElementById('management');
const toolList = document.getElementById('tool-list');
const toolEmpty = document.getElementById('tool-empty');
const manager = document.getElementById('manager');
const result = document.getElementById('manager-status');
const actionField = manager.elements.action;
const toolField = manager.elements.tool;
const playerAudio = document.getElementById('audio');
let settings = { tools: [], bgm: null };
let appliedMusic = null;

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
    playerAudio.pause();
    if (data.bgm) {
      document.getElementById('music-status').textContent = '음악 확인 중…';
      playerAudio.src = data.bgm;
      playerAudio.load();
    } else if (data.bgm === '') {
      playerAudio.removeAttribute('src');
      playerAudio.load();
      document.getElementById('play').disabled = true;
      document.getElementById('seek').disabled = true;
      document.getElementById('music-status').textContent = '배경음악이 꺼져 있습니다.';
    }
  }
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
    url: manager.elements.url.value.trim(), code: manager.elements.code.value
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

fetch('/api/site-settings').then(response => {
  if (!response.ok) throw new Error('Could not load settings');
  return response.json();
}).then(data => {
  renderSettings(data);
  management.hidden = false;
}).catch(() => { toolEmpty.textContent = '교실 도구를 불러오지 못했습니다.'; });

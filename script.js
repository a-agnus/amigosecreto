'use strict';
const AVATARS = [
  ['🐱', 'Gatinho'], ['🦊', 'Raposinha'], ['🐼', 'Panda'], ['🐸', 'Sapinho'],
  ['🦋', 'Borboleta'], ['🌻', 'Girassol'], ['🦄', 'Unicórnio'], ['🐻', 'Ursinho']
];
const COLORS = [
  ['#42795f', 'Verde'], ['#9b72b0', 'Lilás'], ['#cd7891', 'Rosa'],
  ['#517eb4', 'Azul'], ['#be8943', 'Dourado'], ['#b95551', 'Vermelho']
];
function choicePicker(container, options, current, onChange, className) {
  container.replaceChildren();
  options.forEach(([value, label], index) => {
    const button = element('button', className === 'avatar-choice' ? value : '', className);
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(index === current));
    if (className === 'color-choice') button.style.backgroundColor = value;
    button.onclick = () => {
      onChange(index);
      [...container.children].forEach((child, i) => child.setAttribute('aria-pressed', String(i === index)));
    };
    container.append(button);
  });
}


// Base64 de JSON em UTF-8. URLSearchParams protege os caracteres +, / e =.
function encodeData(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}
function decodeData(code) {
  if (!code || code.length > 20000) throw new Error('Convite inválido');
  const bytes = Uint8Array.from(atob(code), char => char.charCodeAt(0));
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!data || ![1, 2].includes(data.v)) throw new Error('Versão inválida');
  for (const [key, max] of Object.entries({ giver: 80, receiver: 80, event: 100, place: 500 })) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > max) throw new Error('Dados inválidos');
  }
  if (!validDate(data.date) || !Number.isFinite(data.amount) || data.amount < 0 || data.amount > 1000000) throw new Error('Dados inválidos');
  if (data.v === 2 && (
    !Number.isInteger(data.avatar) || !AVATARS[data.avatar] ||
    !Number.isInteger(data.color) || !COLORS[data.color] ||
    typeof data.about !== 'string' || data.about.length > 400
  )) throw new Error('Perfil inválido');
  return data;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(value + ':00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value;
}
function dateLabel(value) {
  const [day, time] = value.split('T');
  return `${day.split('-').reverse().join('/')} às ${time} (horário do evento)`;
}
function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function randomInt(max) {
  const buffer = new Uint32Array(1);
  const ceiling = Math.floor(4294967296 / max) * max;
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= ceiling);
  return buffer[0] % max;
}
function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
// Emparelhamento bipartido com caminhos aumentantes: cada destinatário tem
// exatamente um presenteador. Impasses remanejam escolhas anteriores.
// Se não existir emparelhamento perfeito, retorna null (não é um timeout).
// A ordem é aleatória; não promete distribuição uniforme entre todas as soluções.
function drawPairs(people) {
  const choices = people.map(person => shuffle(people
    .map((other, index) => other.id !== person.id && !person.blocked.has(other.id) ? index : -1)
    .filter(index => index !== -1)));
  const owner = Array(people.length).fill(-1);
  function assign(giver, visited) {
    for (const receiver of choices[giver]) {
      if (visited.has(receiver)) continue;
      visited.add(receiver);
      if (owner[receiver] === -1 || assign(owner[receiver], visited)) {
        owner[receiver] = giver;
        return true;
      }
    }
    return false;
  }
  for (const giver of shuffle(people.map((_, index) => index))) {
    if (!assign(giver, new Set())) return null;
  }
  const result = Array(people.length);
  owner.forEach((giver, receiver) => { result[giver] = receiver; });
  return result;
}
function makeLink(data) {
  const url = new URL('revelar.html', window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('d', encodeData(data));
  return url.href;
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text; // Nunca inserir dados de usuário como HTML.
  if (className) node.className = className;
  return node;
}
function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyText(text) {
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('Fallback');
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = element('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
    document.body.append(area);
    area.focus();
    area.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch { /* mostrar alternativa */ }
    area.remove();
    if (!success) window.prompt('Copie manualmente o conteúdo abaixo:', text);
    return success;
  }
}
function setupOrganizer() {
  const $ = id => document.getElementById(id);
  let people = [];
  let nextId = 1;
  let links = [];
  let eventDetails;
  let selectedAvatar = 0;
  let selectedColor = 0;
  choicePicker($('avatares'), AVATARS, 0, index => { selectedAvatar = index; }, 'avatar-choice');
  choicePicker($('cores'), COLORS, 0, index => {
    selectedColor = index;
    $('mini-envelope').style.color = COLORS[index][0];
  }, 'color-choice');
  const status = message => { $('status').textContent = message; };
  function renderPeople() {
    $('participantes').replaceChildren();
    $('vazio').hidden = people.length > 0;
    for (const person of people) {
      const row = element('article', undefined, 'participant');
      const head = element('div', undefined, 'person-head');
      const remove = element('button', 'Remover', 'remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remover ${person.name}`);
      remove.onclick = () => {
        people = people.filter(other => other.id !== person.id);
        people.forEach(other => other.blocked.delete(person.id));
        renderPeople();
        $('nome').focus();
      };
      head.append(element('strong', `${AVATARS[person.avatar][0]} ${person.name}`), remove);
      const details = element('details');
      const summary = element('summary', `Restrições (${person.blocked.size})`);
      const choices = element('div', undefined, 'choices');
      if (people.length < 2) choices.append(element('small', 'Adicione mais uma pessoa para configurar restrições.'));
      for (const other of people) {
        if (other.id === person.id) continue;
        const label = element('label');
        const checkbox = element('input');
        checkbox.type = 'checkbox';
        checkbox.checked = person.blocked.has(other.id);
        checkbox.onchange = () => {
          if (checkbox.checked) person.blocked.add(other.id);
          else person.blocked.delete(other.id);
          summary.textContent = `Restrições (${person.blocked.size})`;
        };
        label.append(checkbox, document.createTextNode(`Não pode tirar ${other.name}`));
        choices.append(label);
      }
      details.append(summary, choices);
      const profile = element('details');
      profile.append(element('summary', 'Editar perfil'));
      const avatarPicker = element('div', undefined, 'avatar-picker');
      choicePicker(avatarPicker, AVATARS, person.avatar, index => {
        person.avatar = index;
        head.firstChild.textContent = `${AVATARS[index][0]} ${person.name}`;
      }, 'avatar-choice');
      const aboutLabel = element('label', 'Sobre mim');
      const about = element('textarea');
      about.maxLength = 400;
      about.rows = 3;
      about.value = person.about;
      about.oninput = () => { person.about = about.value; };
      aboutLabel.append(about);
      const colorPicker = element('div', undefined, 'color-picker');
      choicePicker(colorPicker, COLORS, person.color, index => { person.color = index; }, 'color-choice');
      profile.append(element('small', 'Avatar'), avatarPicker, aboutLabel,
        element('small', 'Envelope'), colorPicker);
      row.append(head, profile, details);
      $('participantes').append(row);
    }
  }
  function addPerson() {
    const name = $('nome').value.trim().replace(/\s+/g, ' ').normalize('NFC');
    if (!name) { status('Digite o nome do participante.'); return; }
    if (people.length >= 100) { status('O limite é de 100 participantes.'); return; }
    if (people.some(person => person.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      status('Esse nome já está na lista. Use um sobrenome para diferenciar pessoas com o mesmo nome.'); return;
    }
    people.push({ id: nextId++, name, avatar: selectedAvatar, color: selectedColor, about: $('sobre').value.trim(), blocked: new Set() });
    $('nome').value = '';
    $('sobre').value = '';
    renderPeople();
    status(`${name} entrou na turma. ${people.length} participante(s).`);
    $('nome').focus();
  }
  $('adicionar').onclick = addPerson;
  $('nome').onkeydown = event => {
    if (event.key === 'Enter') { event.preventDefault(); addPerson(); }
  };
  $('config').onsubmit = event => {
    event.preventDefault();
    if (links.length) return;
    if ($('nome').value.trim()) { status('Clique em Adicionar para incluir o nome digitado antes de sortear.'); return; }
    if (people.length < 2) { status('Adicione pelo menos duas pessoas.'); return; }
    eventDetails = {
      event: $('evento').value.trim(), date: $('data').value,
      place: $('local').value.trim(), amount: Number($('valor').value)
    };
    if (!eventDetails.event || !eventDetails.place || !validDate(eventDetails.date)) {
      status('Preencha o nome, o local e uma data válida para o encontro.'); return;
    }
    const pairs = drawPairs(people);
    if (!pairs) { status('Não existe combinação possível com essas restrições. Desmarque algumas regras e tente novamente.'); return; }
    links = people.map((person, i) => ({ name: person.name, url: makeLink({
      v: 2, giver: person.name, receiver: people[pairs[i]].name,
      avatar: people[pairs[i]].avatar, about: people[pairs[i]].about, color: person.color, ...eventDetails
    }) }));
    $('links').replaceChildren();
    for (const item of links) {
      const row = element('div', undefined, 'link-row');
      const actions = element('div', undefined, 'actions');
      const whatsapp = element('a', 'Enviar no WhatsApp', 'button');
      const message = `🎁 Olá, ${item.name}! Você está no Amigo Secreto: ${eventDetails.event}.\n📅 ${dateLabel(eventDetails.date)}\n📍 ${eventDetails.place}\n🎀 Presente até ${money(eventDetails.amount)}\n\nSeu convite individual (não compartilhe com a turma):\n${item.url}`;
      whatsapp.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener noreferrer';
      whatsapp.setAttribute('aria-label', `Enviar convite de ${item.name} no WhatsApp`);
      const copy = element('button', 'Copiar link');
      copy.type = 'button';
      copy.setAttribute('aria-label', `Copiar link de ${item.name}`);
      copy.onclick = async () => {
        const ok = await copyText(item.url);
        status(ok ? `Link de ${item.name} copiado!` : 'Cópia automática indisponível. Use a janela de cópia manual ou baixe o backup.');
        copy.focus();
      };
      actions.append(whatsapp, copy);
      row.append(element('strong', item.name), actions);
      $('links').append(row);
    }
    $('fields').disabled = true;
    $('resultado').hidden = false;
    status(location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)
      ? 'Teste local: estes links não abrem no celular de outras pessoas. Publique o site e faça o sorteio pela URL pública antes de enviar.'
      : 'Sorteio concluído! Salve seu backup antes de fechar esta página.');
    $('resultado').focus();
  };
  function backup() {
    return `AMIGO SECRETO — ${eventDetails.event}\n${dateLabel(eventDetails.date)}\nLocal: ${eventDetails.place}\nLimite: ${money(eventDetails.amount)}\n\nGuarde em particular. Cada link permite consultar um resultado.\n\n` + links.map(item => `${item.name}\n${item.url}`).join('\n\n');
  }
  $('copiar-backup').onclick = async () => {
    status(await copyText(backup()) ? 'Backup copiado! Cole em um lugar seguro.' : 'Use a cópia manual ou baixe o backup.');
    $('copiar-backup').focus();
  };
  $('baixar-backup').onclick = () => downloadText(backup(), 'amigo-secreto-links.txt');
  $('novo').onclick = () => {
    if (!window.confirm('Salvou seu backup? Editar permite gerar outro sorteio, mas os links antigos continuarão funcionando.')) return;
    links = [];
    $('links').replaceChildren();
    $('resultado').hidden = true;
    $('fields').disabled = false;
    status('Configuração liberada. Se sortear novamente, envie os novos links a todos.');
    $('evento').focus();
  };
  window.addEventListener('beforeunload', event => {
    if (links.length) { event.preventDefault(); event.returnValue = ''; }
  });
}
function setupReveal() {
  const $ = id => document.getElementById(id);
  try {
    const params = new URLSearchParams(location.search);
    if (params.getAll('d').length !== 1) throw new Error('Parâmetro inválido');
    const data = decodeData(params.get('d'));
    $('saudacao').textContent = `Olá, ${data.giver}!`;
    $('grupo').textContent = data.event;
    $('encontro').textContent = dateLabel(data.date);
    $('endereco').textContent = data.place;
    $('limite').textContent = money(data.amount);
    $('convite').hidden = false;
    $('envelope').style.setProperty('--envelope-color', COLORS[data.color ?? 0][0]);
    // O resultado só entra no DOM depois de um clique explícito.
    $('revelar').onclick = () => {
      $('revelar').disabled = true;
      $('revelar').textContent = 'Abrindo seu segredo…';
      $('envelope').classList.add('open');
      const show = () => {
        $('sorteado').textContent = data.receiver;
        $('avatar-sorteado').textContent = AVATARS[data.avatar ?? 0][0];
        $('avatar-sorteado').setAttribute('aria-label', AVATARS[data.avatar ?? 0][1]);
        $('avatar-sorteado').setAttribute('role', 'img');
        $('dicas').textContent = data.about?.trim() || 'Ainda sem dicas. Fale com o organizador.';
        $('capa').hidden = true;
        $('envelope').hidden = true;
        $('segredo').hidden = false;
        $('sorteado').focus();
      };
      setTimeout(show, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400);
    };
  } catch {
    $('convite').hidden = true;
    $('erro').hidden = false;
  }
}
if (typeof document !== 'undefined') {
  if (document.body.dataset.page === 'organizar') setupOrganizer();
  if (document.body.dataset.page === 'revelar') setupReveal();
}

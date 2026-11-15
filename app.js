import {icon,areaIcon} from './icons.js';
import {taskGroups,shortDate,routineProgress,validDay} from './ui-model.js?v=20261115-spare-time';
import {setupMobile,renderMobile,showPayHistory} from './mobile-release.js?v=20261115-spare-time';
import {createSignInAttempt} from './sign-in.js';
import {connectBackend} from './backend.js';
import {recurringTasks} from './routines.js?v=20261115-laundry-instructions';
const $=id=>document.getElementById(id);
const money=x=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(x);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls='btn-small')=>{const n=el('button',text,cls);n.type='button';n.addEventListener('click',fn);return n;};
const formIds=['addTaskForm','addShoppingForm','addMessageForm','addTimeForm','addExpenseForm','addPaymentForm'];
const state={tasks:[],shopping:[],messages:[],timeEntries:[],payments:[],expenses:[],workers:[]};
let user,member,backend,workerId='amy',editId=null,unsubs=[],loaded=new Set(),busy=new Map(),contextEpoch=0,viewEpoch=0,activeTab='home',routineChecks=loadRoutineChecks();
const syncState={};
const openInstructions=new Set(['Laundry']);
let readNotesOpen=false;
function loadRoutineChecks(){
 try{
  const raw=JSON.parse(localStorage.getItem('recurringChecked')||'{}');
  if(!raw||Array.isArray(raw)||typeof raw!=='object')return {};
  const checks=Object.fromEntries(Object.entries(raw).filter(([k,v])=>/^\d+-\d+$/.test(k)&&typeof v==='boolean').slice(0,1000));
  if(!['20261115-routine-update','20261115-laundry-instructions'].includes(localStorage.getItem('recurringRevision'))){
   // Removing the vegetable-prep row moves the two unchanged kitchen tasks.
   const surfaces=checks['3-3'],tower=checks['3-4'];
   for(const key of ['0-0','2-0','3-2','3-3','3-4','3-5','5-0','5-1'])delete checks[key];
   if(typeof surfaces==='boolean')checks['3-2']=surfaces;
   if(typeof tower==='boolean')checks['3-3']=tower;
   localStorage.setItem('recurringChecked',JSON.stringify(checks));
   localStorage.setItem('recurringRevision','20261115-routine-update');
  }
  if(localStorage.getItem('recurringRevision')!=='20261115-laundry-instructions'){
   // The two laundry instruction rows become one complete laundry task.
   delete checks['5-0'];delete checks['5-1'];
   localStorage.setItem('recurringChecked',JSON.stringify(checks));
   localStorage.setItem('recurringRevision','20261115-laundry-instructions');
  }
  return checks;
 }catch{return {};}
}
function saveRoutineChecks(){try{localStorage.setItem('recurringChecked',JSON.stringify(routineChecks));}catch{failure(Error('Routine changes could not be saved on this device.'));}}
const financial=['timeEntries','payments','expenses'];
const visible=name=>state[name].filter(e=>e.workerId===workerId&&!e.voided);
const selectedWorker=()=>state.workers.find(w=>w.id===workerId);
const isAdmin=()=>member?.role==='admin';
const canPayroll=()=>member?.active&&member.role!=='agent'&&workerId!=='legacy'&&(isAdmin()||member.workerId===workerId);
const failure=e=>{const message=e?.message||String(e);$('dataError').textContent=message;document.querySelectorAll('dialog[open] .sheet-error').forEach(n=>n.textContent=message);};
const financialBusy=()=>[...busy.keys()].some(k=>['addTimeForm','addExpenseForm','addPaymentForm'].includes(k)||k.startsWith('void:'));
function validEntry(kind,e){
 const date=e.date;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return false;
 if(e.notes!=null&&typeof e.notes!=='string')return false;
 return kind==='timeEntries'?Number.isFinite(e.hours)&&Number.isFinite(e.rate):Number.isFinite(e.amount)&&(kind!=='expenses'||typeof e.description==='string');
}
function focusContext(){const n=document.activeElement;if(!n?.dataset.focusKey)return null;return{key:n.dataset.focusKey,tab:n.closest('.tab-content')?.id};}
function restoreFocus(context){if(!context)return;const tab=document.getElementById(context.tab);if(!tab?.classList.contains('active'))return;const target=[...tab.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===context.key&&!n.disabled&&n.getClientRects().length);if(target){target.focus({preventScroll:true});return;}const heading=tab.querySelector('.page-title');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
function keyed(control,key){control.dataset.focusKey=key;return control;}
async function action(key,fn){
 if(busy.has(key))return;const token=Symbol(key),epoch=contextEpoch,isCurrent=()=>epoch===contextEpoch;
 const focus=focusContext();busy.set(key,token);render();const pendingFocus=document.activeElement;
 try{if(isCurrent())$('dataError').textContent='';await fn(isCurrent);}
 catch(e){if(isCurrent())failure(e);}
 finally{if(busy.get(key)===token)busy.delete(key);if(isCurrent()){const restore=document.activeElement===pendingFocus||document.activeElement===document.body;render();if(restore)restoreFocus(focus);}}
}
function switchTab(tab){activeTab=tab;if(tab==='payments')showPayHistory('payments');document.querySelectorAll('.tab-content').forEach(n=>n.classList.toggle('active',n.id===tab+'Tab'));document.querySelectorAll('.nav-btn').forEach(n=>n.classList.toggle('active',n.dataset.tab===(['timesheet','expenses'].includes(tab)?'payments':tab==='recurring'?'tasks':tab)));document.querySelectorAll('.nav-btn').forEach(n=>{if(n.classList.contains('active'))n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});document.querySelector('.main').scrollTop=0;}
function cancelEdit(){editId=null;$('timeSubmitBtn').textContent='Log Hours';$('timeCancelBtn').classList.add('hidden');$('entryDate').value=today();$('entryHours').value='';$('entryNotes').value='';}
function renderWorkers(){const select=$('workerSelect');select.replaceChildren();const choices=member?.role==='worker'?[member.workerId]:(window.HOUSEHOLD_CONFIG.legacyAttributionConfirmed?['amy','ella']:['amy','ella','legacy']);for(const id of choices){const o=el('option',id==='legacy'?'Legacy · unassigned':(state.workers.find(w=>w.id===id)?.displayName||id));o.value=id;select.append(o);}if(!choices.includes(workerId))workerId=choices[0];select.value=workerId;select.disabled=busy.size>0||member?.role==='agent';}
function render(){
 const focus=focusContext();
 const w=selectedWorker();
 $('workerStatus').textContent=member?.role==='agent'?'Household tasks only. Payroll access is unavailable.':workerId==='legacy'?'Preserved history, read-only. Ownership has not been assigned.':`${w?.displayName||workerId} · ${Number.isFinite(w?.hourlyRate)?money(w.hourlyRate)+' / hour':'Hourly rate awaiting confirmation. New hours cannot be logged.'}`;
 for(const id of formIds)$(id).querySelectorAll('input,textarea,button').forEach(n=>n.disabled=busy.has(id));
 for(const id of ['addTimeForm','addExpenseForm'])$(id).querySelectorAll('input,button').forEach(n=>n.disabled=!canPayroll()||busy.has(id));
 $('addPaymentForm').querySelectorAll('input,button').forEach(n=>n.disabled=!canPayroll()||!isAdmin()||busy.has('addPaymentForm'));
 if(!Number.isFinite(w?.hourlyRate)&&!editId)$('timeSubmitBtn').disabled=true;
 renderTasks();renderShopping();renderMessages();renderLedger();renderRoutine();
 const ready=financial.every(x=>loaded.has(x))&&!financialBusy();
 const pending=financial.some(x=>syncState[x]?.hasPendingWrites)||financialBusy();
 $('syncStatus').textContent=pending?'Saving…':(!ready&&member?.role!=='agent'?'Checking current data…':'');
 const invalid=financial.some(k=>visible(k).some(e=>!validEntry(k,e)));
 $('legacyNotice').hidden=member?.role==='agent'||window.HOUSEHOLD_CONFIG.legacyAttributionConfirmed===true;
 $('workerSelect').disabled=busy.size>0||member?.role==='agent';
 const earned=visible('timeEntries').reduce((n,e)=>n+e.hours*e.rate,0),expenses=visible('expenses').reduce((n,e)=>n+e.amount,0),paid=visible('payments').reduce((n,e)=>n+e.amount,0),balance=earned+expenses-paid;
 for(const id of ['balanceAmount','homeBalanceAmount'])$(id).textContent=member?.role==='agent'?'Restricted':invalid?'Review required':ready?money(balance):(pending?'Syncing…':'Checking current data…');
 $('totalEarned').textContent=invalid?'Review required':ready?money(earned):'…';$('totalExpenses').textContent=invalid?'Review required':ready?money(expenses):'…';$('totalPaid').textContent=invalid?'Review required':ready?money(paid):'…';
 renderMobile({user,member,state,workerId,loaded,financialBusy:financialBusy(),invalid,ready,validEntry,action,backend,switchTab});
 restoreFocus(focus);
}
function iconButton(name,label,fn,cls='btn-icon'){const b=button('',fn,cls);b.append(icon(name));b.setAttribute('aria-label',label);b.title=label;return b;}
function taskCopy(t){let text=t.description||'';if(validDay(t.dueDate)){const suffix=' — '+new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(t.dueDate+'T12:00:00Z'));if(text.endsWith(suffix))text=text.slice(0,-suffix.length);}return text;}
function taskRow(t){
 const row=el('div',null,'task-item'+(t.completed?' completed':''));
 const check=iconButton('check',(t.completed?'Reopen: ':'Complete: ')+t.description,()=>action('task:'+t.id,()=>backend.update('tasks',t.id,{completed:!t.completed,completedAt:t.completed?null:backend.timestamp()})),'checkbox'+(t.completed?' checked':''));check.setAttribute('role','checkbox');check.setAttribute('aria-checked',String(!!t.completed));check.disabled=busy.has('task:'+t.id);keyed(check,'task:'+t.id+':check');
 const copy=el('div',null,'task-text');copy.append(el('span',taskCopy(t)));if(validDay(t.dueDate))copy.append(el('span',shortDate(t.dueDate),'task-date'));
 if(!t.completed){const spare=button(t.nonUrgent===true?'Move to To do':'Spare time',()=>action('task:'+t.id,async current=>{await backend.update('tasks',t.id,{nonUrgent:t.nonUrgent!==true});if(current()&&activeTab==='tasks'){const moved=[...document.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey==='task:'+t.id+':spare');moved?.scrollIntoView({block:'nearest'});}}),'task-spare-button');spare.prepend(icon(t.nonUrgent===true?'arrow':'leaf'));spare.setAttribute('aria-label',(t.nonUrgent===true?'Move to To do: ':'Mark as spare time: ')+t.description);spare.disabled=busy.has('task:'+t.id);keyed(spare,'task:'+t.id+':spare');copy.append(spare);}
 const remove=iconButton('trash','Delete task: '+t.description,()=>{if(confirm('Delete this task?'))action('task:'+t.id,()=>backend.remove('tasks',t.id));},'btn-icon delete');remove.disabled=busy.has('task:'+t.id);keyed(remove,'task:'+t.id+':delete');
 row.append(check,copy,remove);return row;
}
function renderTasks(){
 const list=$('taskList');list.replaceChildren();
 for(const group of taskGroups(state.tasks)){const section=el('section',null,'task-group '+group.key);section.id='tasks-'+group.key;const head=el('h3',null,'list-heading');if(group.key==='spare-time')head.append(icon('leaf'));head.append(el('span',group.label),el('span',group.tasks.length,'count-label'));section.append(head,...group.tasks.map(taskRow));list.append(section);}
 if(!list.children.length)list.append(el('p',loaded.has('tasks')?'All caught up. Add a task when something comes up.':'Loading tasks…','empty-state'));
 const done=state.tasks.filter(t=>t.completed);$('completedTaskList').replaceChildren(...done.map(taskRow));$('completedCount').textContent=done.length;$('completedSection').classList.toggle('hidden',!done.length);
}
function renderShopping(){const list=$('shoppingList');list.replaceChildren();for(const item of state.shopping){const row=el('div',null,'task-item');const check=iconButton('check','Mark bought: '+item.name,()=>action('shop:'+item.id,()=>backend.remove('shopping',item.id)),'checkbox');check.disabled=busy.has('shop:'+item.id);keyed(check,'shop:'+item.id);row.append(check,el('span',item.name,'task-text'));list.append(row);}if(!state.shopping.length)list.append(el('p',loaded.has('shopping')?'Nothing to pick up. Add an item above.':'Loading shopping…','empty-state'));}
function renderMessages(){
 const list=$('messageList');list.replaceChildren();const unread=state.messages.filter(m=>!m.read),read=state.messages.filter(m=>m.read);
 const noteRow=msg=>{const row=el('article',null,'message-item'+(msg.read?' read':''));
 const meta=el('div',null,'note-status');meta.append(icon(msg.read?'check':'notes'),el('strong',msg.read?'Read':'Unread'));row.append(meta,el('div',msg.text,'message-content'));
 const controls=el('div',null,'entry-actions');const readButton=button(msg.read?'Mark unread':'Mark read',()=>action('msg:'+msg.id,()=>backend.update('messages',msg.id,{read:!msg.read})));const remove=iconButton('trash','Delete note',()=>{if(confirm('Delete this note?'))action('msg:'+msg.id,()=>backend.remove('messages',msg.id));},'btn-icon delete');readButton.disabled=remove.disabled=busy.has('msg:'+msg.id);keyed(readButton,'note:'+msg.id+':read');keyed(remove,'note:'+msg.id+':delete');controls.append(readButton,remove);row.append(controls);return row;};
 if(unread.length){const title=el('h3',unread.length+' unread','list-heading');list.append(title,...unread.map(noteRow));}
 else list.append(el('p',loaded.has('messages')?'You’re up to date.':'Loading notes…','empty-state'));
 if(read.length){const history=el('details',null,'read-notes');history.open=readNotesOpen;history.append(el('summary','Read notes · '+read.length));const rows=el('div',null,'message-list');rows.append(...read.map(noteRow));history.append(rows);history.ontoggle=()=>{if(history.isConnected)readNotesOpen=history.open;};list.append(history);}
 if(state.messages.length)list.append(el('p','Read status is shared with the household.','quiet-note'));
}
function renderLedger(){for(const [kind,id] of [['timeEntries','timeEntryList'],['payments','paymentList'],['expenses','expenseList']]){const list=$(id);list.replaceChildren();if(member?.role==='agent'){list.append(el('p','Payroll is restricted.','empty-state'));continue;}const rows=visible(kind).sort((a,b)=>String(b.date??'').localeCompare(String(a.date??'')));for(const entry of rows){const row=el('div',null,'entry-item');if(!validEntry(kind,entry)){row.append(el('p','This record has invalid fields and needs review. It is preserved; the balance is not shown as valid.','entry-notes'));list.append(row);continue;}row.dataset.date=entry.date;const main=el('div',null,'entry-main');main.append(el('span',shortDate(entry.date),'entry-date'));if(kind==='timeEntries')main.append(el('span',`${entry.hours}h × ${money(entry.rate)}`,'entry-hours'));main.append(el('span',money(kind==='timeEntries'?entry.hours*entry.rate:entry.amount),'entry-amount'));row.append(main);if(entry.notes||entry.description)row.append(el('div',entry.notes||entry.description,'entry-notes'));if(canPayroll()&&!entry.sourcePath&&!entry.importRunId&&(kind!=='payments'||isAdmin())){const controls=el('div',null,'entry-actions');if(kind==='timeEntries')controls.append(button('Edit',()=>{if(financialBusy())return;editId=entry.id;$('entryDate').value=entry.date;$('entryHours').value=entry.hours;$('entryNotes').value=entry.notes||'';$('timeSubmitBtn').textContent='Update';$('timeCancelBtn').classList.remove('hidden');document.getElementById('sheet-addTimeForm').showModal();render();}));controls.append(button('Void',()=>{if(confirm('Void this record? It will be retained for audit but removed from the balance.'))action('void:'+entry.id,async current=>{await backend.remove(kind,entry.id);if(current()&&editId===entry.id)cancelEdit();});},'btn-small delete'));controls.querySelectorAll('button').forEach(n=>n.disabled=financialBusy());row.append(controls);}list.append(row);}if(!rows.length)list.append(el('p',loaded.has(kind)?'No entries for this person.':'Loading history…','empty-state'));}}
function renderRoutine(){
 const focused=document.activeElement?.dataset.routineKey;
 const progress=routineProgress(recurringTasks,routineChecks);
 for(const id of ['homeRoutineBar','routineBar']){$(id).max=progress.total;$(id).value=progress.done;}
 $('routineCount').textContent=progress.done+' of '+progress.total+' done';$('homeRoutineProgress').textContent=progress.done?progress.done+' of '+progress.total+' done':'Your room-by-room checklist';$('shiftActionLabel').textContent=progress.done===progress.total?'Shift routine complete':progress.done?'Continue your shift':'Start your shift';
 const list=$('recurringList');list.replaceChildren();
 recurringTasks.forEach((area,i)=>{const section=el('section',null,'area-section');const header=el('div',null,'area-header');const done=area.tasks.filter((_,j)=>routineChecks[i+'-'+j]).length;header.append(icon(areaIcon[area.area]),el('h3',area.area),el('span',done+'/'+area.tasks.length,'area-count'+(done===area.tasks.length?' is-done':'')));section.append(header);
 area.tasks.forEach((text,j)=>{const key=i+'-'+j,checked=!!routineChecks[key];const row=el('div',null,'area-task'+(checked?' checked':''));const check=iconButton('check',text.replace('|',' — '),()=>{routineChecks[key]=!routineChecks[key];saveRoutineChecks();renderRoutine();},'checkbox'+(checked?' checked':''));check.dataset.routineKey=key;check.setAttribute('role','checkbox');check.setAttribute('aria-checked',String(checked));row.append(check,el('span',text.replace('|',' · '),'task-text'));section.append(row);});
 if(area.notes.length){const details=el('details',null,'area-instructions');details.open=openInstructions.has(area.area);const summary=el('summary',area.area==='Laundry'?'Washing & drying':'How we do it');summary.prepend(icon('info'));const notes=el('ul');notes.append(...area.notes.map(n=>el('li',n)));details.append(summary,notes);details.ontoggle=()=>{if(details.isConnected){if(details.open)openInstructions.add(area.area);else openInstructions.delete(area.area);}};section.append(details);}
 if(area.area==='Shopping'&&state.shopping.length){const preview=button(state.shopping.length+' items on the shopping list',()=>switchTab('shopping'),'shopping-preview');preview.prepend(icon('shop'));section.append(preview);}
 list.append(section);});
 if(focused)document.querySelector('[data-routine-key="'+focused+'"]').focus({preventScroll:true});
}
function dateValue(id){const value=$(id).value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Choose a valid date.');return value;}
function positive(id){const value=Number($(id).value);if(!Number.isFinite(value)||value<=0)throw Error('Enter an amount greater than zero.');return value;}
function bindForm(id,fn){$(id).addEventListener('submit',e=>{e.preventDefault();action(id,async current=>{const controls=[...$(id).querySelectorAll('input,textarea,button')];controls.forEach(n=>n.disabled=true);try{await fn(current);}finally{if(current())render();}});});}
bindForm('addTaskForm',async current=>{const text=$('newTaskInput').value.trim();if(!text)return;await backend.add('tasks',{description:text,completed:false,nonUrgent:$('newTaskSpareTime').checked});if(current()){$('newTaskInput').value='';$('newTaskSpareTime').checked=false;}});
bindForm('addShoppingForm',async current=>{const text=$('newShoppingInput').value.trim();if(!text)return;await backend.add('shopping',{name:text});if(current())$('newShoppingInput').value='';});
bindForm('addMessageForm',async current=>{const text=$('newMessageInput').value.trim();if(!text)return;await backend.add('messages',{text,read:false});if(current()){$('newMessageInput').value='';$('noteComposer').open=false;}});
bindForm('addTimeForm',async current=>{if(!canPayroll())throw Error('This payroll view is read-only.');const existing=state.timeEntries.find(e=>e.id===editId);const rate=existing?.rate??selectedWorker()?.hourlyRate;if(!Number.isFinite(rate)||rate<=0)throw Error('The hourly rate must be confirmed first.');const data={date:dateValue('entryDate'),hours:positive('entryHours'),notes:$('entryNotes').value.trim()||null};if(editId){if(!existing||existing.workerId!==workerId||existing.sourcePath||existing.voided)throw Error('This entry cannot be edited.');await backend.update('timeEntries',editId,data);}else await backend.add('timeEntries',{...data,workerId,rate});if(current()){cancelEdit();document.getElementById('sheet-addTimeForm')?.close();}});
bindForm('addExpenseForm',async current=>{if(!canPayroll())throw Error('This payroll view is read-only.');const description=$('expenseDescription').value.trim();if(!description)throw Error('Enter what the expense was for.');await backend.add('expenses',{date:dateValue('expenseDate'),amount:positive('expenseAmount'),description,workerId});if(current())$('expenseAmount').value='';if(current()){$('expenseDescription').value='';document.getElementById('sheet-addExpenseForm')?.close();}});
bindForm('addPaymentForm',async current=>{if(!canPayroll()||!isAdmin())throw Error('Only a household administrator can record payments.');await backend.add('payments',{date:dateValue('paymentDate'),amount:positive('paymentAmount'),notes:$('paymentNotes').value.trim()||null,workerId});if(current())$('paymentAmount').value='';if(current()){$('paymentNotes').value='';document.getElementById('sheet-addPaymentForm')?.close();}});
$('workerSelect').addEventListener('change',()=>{++contextEpoch;busy.clear();cancelEdit();workerId=$('workerSelect').value;for(const id of ['paymentAmount','paymentNotes','expenseAmount','expenseDescription'])$(id).value='';render();});
$('timeCancelBtn').addEventListener('click',cancelEdit);$('toggleCompleted').addEventListener('click',()=>{$('completedTaskList').classList.toggle('hidden');});
$('resetRecurring').addEventListener('click',()=>{if(!confirm('Start a new shift and clear this device’s routine checks?'))return;routineChecks={};saveRoutineChecks();renderRoutine();});
window.closePopup=()=>$('popupOverlay').classList.remove('active');$('popupOverlay').addEventListener('click',e=>{if(e.target.id==='popupOverlay')window.closePopup();});
document.querySelectorAll('.nav-btn').forEach(n=>n.addEventListener('click',()=>switchTab(n.dataset.tab)));document.querySelectorAll('.home-card').forEach(n=>n.addEventListener('click',()=>switchTab(n.dataset.goto)));
for(const id of ['entryDate','paymentDate','expenseDate'])$(id).value=today();
$('authSignOut').addEventListener('click',async()=>{try{await backend.logout();}catch(e){$('authError').textContent=e.message;}});
$('signOut').addEventListener('click',()=>action('signout',()=>backend.logout()));
const signInButton=$('googleLogin'),signInStatus=el('p','');signInStatus.setAttribute('role','status');signInButton.after(signInStatus);signInButton.disabled=true;
signInButton.addEventListener('click',createSignInAttempt({
 login:()=>backend.googleLogin(),
 onBusy:pending=>{signInButton.disabled=pending;signInButton.setAttribute('aria-busy',String(pending));signInButton.textContent=pending?'Signing in…':window.HOUSEHOLD_CONFIG.mode==='demo'?'Open demo':'Continue with Google';},
 onStatus:message=>signInStatus.textContent=message,
 onError:message=>$('authError').textContent=message
}));
$('emulatorLogin').addEventListener('submit',async e=>{e.preventDefault();try{$('authError').textContent='';await backend.login($('authEmail').value,$('authPassword').value);$('authPassword').value='';}catch(e){$('authError').textContent=e.message;}});
setupMobile(switchTab);
try{
 const config=window.HOUSEHOLD_CONFIG;$('environmentBanner').textContent=config.mode==='demo'?'DEMO · Synthetic financial examples. No live connection. Changes reset on reload.':config.mode==='emulator'?'ISOLATED EMULATORS · No production connection.':'';$('environmentBanner').hidden=config.mode==='production';
 $('emulatorLogin').hidden=config.mode!=='emulator';$('googleLogin').hidden=config.mode==='emulator';if(config.mode==='demo')$('googleLogin').textContent='Open demo';
 backend=await connectBackend(config);
 signInButton.disabled=false;
 backend.watchAuth((nextUser,nextMember,error)=>{++contextEpoch;const view=++viewEpoch;document.querySelectorAll('dialog[open]').forEach(d=>d.close());busy.clear();unsubs.forEach(fn=>fn());unsubs=[];loaded.clear();for(const key of Object.keys(state)){state[key]=[];delete syncState[key];}user=nextUser;member=nextMember;cancelEdit();for(const id of ['paymentAmount','paymentNotes','expenseAmount','expenseDescription'])$(id).value='';for(const id of ['paymentDate','expenseDate'])$(id).value=today();
 const approved=!!(user&&member?.active&&['admin','worker','agent'].includes(member.role)&&(member.role!=='worker'||['amy','ella'].includes(member.workerId)));$('authPanel').hidden=approved;$('appContent').hidden=!approved;$('authSignOut').hidden=!user;
 if(!approved){$('authError').textContent=error?.message||(user?'This account has not been approved for household access.':'');return;}
 workerId=member.role==='worker'?member.workerId:'amy';renderWorkers();render();switchTab('home');
 for(const name of Object.keys(state)){if(member.role==='agent'&&(financial.includes(name)||name==='workers'))continue;unsubs.push(backend.subscribe(name,(rows,metadata={fromCache:false,hasPendingWrites:false})=>{if(view!==viewEpoch)return;syncState[name]=metadata;if(['tasks','shopping','messages'].includes(name)){const time=x=>typeof x?.toMillis==='function'?x.toMillis():(Date.parse(x)||0);rows.sort((a,b)=>time(b.createdAt)-time(a.createdAt));}state[name]=rows;if(!metadata.fromCache&&!metadata.hasPendingWrites)loaded.add(name);else loaded.delete(name);if(name==='workers')renderWorkers();render();},e=>{if(view!==viewEpoch)return;state[name]=[];loaded.delete(name);render();failure(e);}));}
 });
}catch(e){$('authError').textContent=e.message;}

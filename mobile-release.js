import {icon} from './icons.js';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const titles={addTimeForm:'Log hours',addExpenseForm:'Add an expense',addPaymentForm:'Record a payment'};
export function showPayHistory(view='payments'){
 $('paymentHistoryPanel').hidden=view!=='payments';$('workHistoryPanel').hidden=view!=='work';
 document.querySelectorAll('[data-pay-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.payView===view)));
}
export function setupMobile(switchTab){
 document.querySelectorAll('[data-icon]').forEach(n=>n.replaceChildren(icon(n.dataset.icon)));
 document.querySelector('.pay-actions').before(document.querySelector('.balance-card'));
 document.querySelectorAll('.account-menu').forEach(d=>d.addEventListener('keydown',e=>{if(e.key==='Escape')d.open=false;}));
 for(const [id,title] of Object.entries(titles)){
  const dialog=node('dialog',null,'entry-sheet');dialog.id='sheet-'+id;
  const head=node('div',null,'sheet-heading'),heading=node('h2',title);heading.id='title-'+id;head.append(heading);dialog.setAttribute('aria-labelledby',heading.id);
  const close=node('button',null,'btn-icon');close.append(icon('close'));close.type='button';close.setAttribute('aria-label','Close');close.onclick=()=>dialog.close();head.append(close);
  dialog.append(head,node('p','','sheet-person'));const error=node('p','','sheet-error');error.setAttribute('role','alert');dialog.append(error);const form=$(id);form.querySelectorAll('input').forEach(input=>{const label=node('label',input.getAttribute('aria-label')||input.placeholder,'field-label');input.before(label);label.append(input);});dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{error.textContent='';if(id==='addTimeForm')$('timeCancelBtn').click();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 }
 document.querySelectorAll('[data-mobile-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.mobileTab));
 document.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>$( 'sheet-'+b.dataset.sheet).showModal());
 document.querySelectorAll('[data-pay-view]').forEach(b=>b.onclick=()=>showPayHistory(b.dataset.payView));
 $('workerSelect').addEventListener('change',()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 $('homeDate').textContent=new Date().toLocaleDateString('en-AU',{timeZone:'Australia/Melbourne',weekday:'long',day:'numeric',month:'short'});
}
export function renderMobile({user,member,state,workerId,loaded,financialBusy,invalid,ready,validEntry,action,backend,switchTab}){
 const admin=member?.role==='admin',agent=member?.role==='agent';
 const name=member?.displayName||user?.displayName?.split(' ')[0]||(member?.workerId?member.workerId[0].toUpperCase()+member.workerId.slice(1):'');
 $('homeGreeting').textContent=name?'Hi, '+name+'.':'Welcome home.';
 $('accountInitial').textContent=(name||'H').slice(0,1).toUpperCase();$('accountName').textContent=name||'Household';
 const open=state.tasks.filter(t=>!t.completed);
 const toDo=open.filter(t=>t.nonUrgent!==true).length,spare=open.filter(t=>t.nonUrgent===true).length;
 const unread=state.messages.filter(m=>!m.read).length;
 const attention=$('homeAttention');attention.replaceChildren();
 function attentionRow(count,title,destination,type,iconName){
  const b=node('button',null,'attention-row '+type);b.type='button';b.append(icon(iconName),node('span',title),node('strong',count,'attention-count'),icon('arrow'));b.onclick=()=>switchTab(destination);attention.append(b);
 }
 if(loaded.has('tasks')&&toDo)attentionRow(toDo,'Tasks to do','tasks','upcoming','tasks');
 if(loaded.has('messages')&&unread)attentionRow(unread,'Unread notes','messages','attention','notes');
 $('homeSpareTasks').hidden=!loaded.has('tasks')||!spare;
 $('homeSpareTasks').replaceChildren(icon('leaf'),node('span',spare+' '+(spare===1?'task':'tasks')+' for spare time'),icon('arrow'));
 $('homeSpareTasks').onclick=()=>{switchTab('tasks');$('tasks-spare-time')?.scrollIntoView({block:'start'});};
 const readyHome=loaded.has('tasks')&&loaded.has('messages');
 $('homeSummary').textContent=readyHome?(attention.children.length?'':'No updates to catch up on.'):'Checking updates…';$('homeSummary').hidden=readyHome&&!!attention.children.length;
 function badge(tab,count,label){const n=$('navBadge-'+tab);n.hidden=!count;n.textContent=count>99?'99+':String(count);n.closest('button').setAttribute('aria-label',label+(count?', '+count+' '+(tab==='messages'?'unread':tab==='tasks'?'to do':'items'):''));}
 badge('tasks',toDo,'Tasks');badge('messages',unread,'Notes');badge('shopping',state.shopping.length,'Shop');
 const primary=admin||agent?'Add task':'Log hours',secondary=admin?'Record payment':agent?'Shopping':'Add expense';
 $('homePrimary').replaceChildren(icon(admin||agent?'plus':'clock'),node('span',primary));$('homePrimary').onclick=()=>{if(admin||agent){switchTab('tasks');$('newTaskInput').focus();}else $('sheet-addTimeForm').showModal();};
 $('homeSecondary').replaceChildren(icon(admin?'pay':agent?'shop':'plus'),node('span',secondary));$('homeSecondary').onclick=()=>agent?switchTab('shopping'):$(admin?'sheet-addPaymentForm':'sheet-addExpenseForm').showModal();
 $('homePrimary').disabled=!admin&&!agent&&financialBusy;$('homeSecondary').disabled=!agent&&financialBusy;
 $('recordPaymentShortcut').hidden=!admin;
 document.querySelector('.nav-btn[data-tab="payments"]').hidden=agent;
 $('homePayLink').hidden=agent;$('workerSelectLabel').hidden=!admin;
 const combined=$('combinedActivity');combined.replaceChildren();const rows=[];
 for(const [id,label] of [['timeEntryList','Hours'],['expenseList','Expense']])for(const child of Array.from($(id).children)){
  if(!child.classList.contains('entry-item'))continue;
  const date=child.dataset.date||'';child.prepend(node('p',label,'activity-type'));rows.push({date,child});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date));combined.append(...rows.map(x=>x.child));
 if(!rows.length)combined.append(node('p',ready?'No entries for this person.':'Checking current history…','empty-state'));
 const paymentCount=state.payments.filter(e=>e.workerId===workerId&&!e.voided).length;
 $('paymentHistorySummary').textContent=loaded.has('payments')?`${paymentCount} ${paymentCount===1?'payment':'payments'} recorded`:'Checking payment history…';
 // Field disabling remains owned by the tested financial controller.
 document.querySelectorAll('[data-sheet]').forEach(b=>b.disabled=financialBusy||agent);
 document.querySelectorAll('.sheet-person').forEach(n=>n.textContent=state.workers.find(w=>w.id===workerId)?.displayName||workerId);
}

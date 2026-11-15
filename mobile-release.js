const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const titles={addTimeForm:'Log hours',addExpenseForm:'Add an expense',addPaymentForm:'Record a payment'};
export function showPayHistory(view='payments'){
 $('paymentHistoryPanel').hidden=view!=='payments';$('workHistoryPanel').hidden=view!=='work';
 document.querySelectorAll('[data-pay-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.payView===view)));
}
export function setupMobile(switchTab){
 for(const [id,title] of Object.entries(titles)){
  const dialog=node('dialog',null,'entry-sheet');dialog.id='sheet-'+id;
  const head=node('div',null,'sheet-heading');head.append(node('h2',title));
  const close=node('button','×','btn-icon');close.type='button';close.setAttribute('aria-label','Close');close.onclick=()=>dialog.close();head.append(close);
  dialog.append(head,node('p','','sheet-person'));const error=node('p','','sheet-error');error.setAttribute('role','alert');dialog.append(error);const form=$(id);form.querySelectorAll('input').forEach(input=>{const label=node('label',input.getAttribute('aria-label')||input.placeholder,'field-label');input.before(label);label.append(input);});dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{error.textContent='';if(id==='addTimeForm')$('timeCancelBtn').click();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 }
 document.querySelectorAll('[data-mobile-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.mobileTab));
 document.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>$( 'sheet-'+b.dataset.sheet).showModal());
 document.querySelectorAll('[data-pay-view]').forEach(b=>b.onclick=()=>showPayHistory(b.dataset.payView));
 $('workerSelect').addEventListener('change',()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 $('homeDate').textContent=new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'});
}
export function renderMobile({user,member,state,workerId,loaded,financialBusy,invalid,ready,validEntry,action,backend,switchTab}){
 const admin=member?.role==='admin',agent=member?.role==='agent';
 const name=member?.displayName||user?.displayName?.split(' ')[0]||(member?.workerId?member.workerId[0].toUpperCase()+member.workerId.slice(1):'');
 $('homeGreeting').textContent=name?'Hello, '+name+'.':'Our household';
 const open=state.tasks.filter(t=>!t.completed);
 const unread=state.messages.filter(m=>!m.read).length;
 $('homeSummary').textContent=loaded.has('tasks')&&loaded.has('messages')?`${open.length?`${open.length} open ${open.length===1?'task':'tasks'}`:'No open tasks'} and ${unread?`${unread} unread ${unread===1?'note':'notes'}`:'no unread notes'}.`:'Checking household updates…';
 $('homePrimary').textContent=admin||agent?'Add task':'Log hours';$('homePrimary').onclick=()=>{if(admin||agent){switchTab('tasks');$('newTaskInput').focus();}else $('sheet-addTimeForm').showModal();};
 $('homeSecondary').textContent=admin?'Record payment':agent?'Shopping':'Add expense';$('homeSecondary').onclick=()=>agent?switchTab('shopping'):$(admin?'sheet-addPaymentForm':'sheet-addExpenseForm').showModal();
 $('homePrimary').disabled=!admin&&!agent&&financialBusy;$('homeSecondary').disabled=!agent&&financialBusy;
 $('recordPaymentShortcut').hidden=!admin;
 document.querySelector('.nav-btn[data-tab="payments"]').hidden=agent;
 $('homePayLink').hidden=agent;
 const combined=$('combinedActivity');combined.replaceChildren();const rows=[];
 for(const [id,label] of [['timeEntryList','Hours'],['expenseList','Expense']])for(const child of Array.from($(id).children)){
  if(!child.classList.contains('entry-item'))continue;
  const date=child.querySelector('.entry-date')?.textContent||'';child.prepend(node('p',label,'activity-type'));rows.push({date,child});
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date));combined.append(...rows.map(x=>x.child));
 if(!rows.length)combined.append(node('p',ready?'No entries for this person.':'Checking current history…','empty-state'));
 const paymentCount=state.payments.filter(e=>e.workerId===workerId&&!e.voided).length;
 $('paymentHistorySummary').textContent=loaded.has('payments')?`${paymentCount} ${paymentCount===1?'payment':'payments'} recorded`:'Checking payment history…';
 // Field disabling remains owned by the tested financial controller.
 document.querySelectorAll('[data-sheet]').forEach(b=>b.disabled=financialBusy||agent);
 document.querySelectorAll('.sheet-person').forEach(n=>n.textContent=state.workers.find(w=>w.id===workerId)?.displayName||workerId);
}

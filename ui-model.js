export const householdDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function nextDate(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export function shortDate(day){return validDay(day)?new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')):day;}
export function taskBucket(task,day=householdDate()){
 if(!validDay(task.dueDate))return 'Anytime';
 if(task.dueDate<day)return 'Overdue';
 if(task.dueDate===day)return 'Today';
 if(task.dueDate===nextDate(day))return 'Tomorrow';
 return 'Upcoming';
}
export function taskGroups(tasks){
 const open=tasks.filter(t=>!t.completed);
 return [
  {key:'to-do',label:'To do',tasks:open.filter(t=>t.nonUrgent!==true)},
  {key:'spare-time',label:'When there’s time',tasks:open.filter(t=>t.nonUrgent===true)}
 ].filter(g=>g.tasks.length);
}
export function routineProgress(areas,checks){let total=0,done=0;areas.forEach((a,i)=>a.tasks.forEach((_,j)=>{total++;if(checks[i+'-'+j])done++;}));return{total,done};}

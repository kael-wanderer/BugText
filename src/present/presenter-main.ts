import { emit, emitTo, listen } from '@tauri-apps/api/event';
import { renderMarkdown } from '../preview';
import { resolvePreviewImages } from '../preview-images';
import { enhancePreview } from '../render-extras';
import { enhancePreviewTasks } from '../preview-tasks';
import { createKeyReader } from './keys';
import { parsePresenterState, PRESENTER_COMMAND, PRESENTER_READY, PRESENTER_STATE, type PresenterCommand, type PresenterState } from './protocol';
import './present.css';

export function createPresenter(host: HTMLElement, send: (owner: string, command: PresenterCommand) => void) {
 let state: PresenterState | null = null, started = false, paused = false, elapsed = 0, lastTick = Date.now();
 const root = document.createElement('div'); root.className = 'presenter';
 const header = document.createElement('header'); const counter = document.createElement('span'), timer = document.createElement('span'), clock = document.createElement('span');
 const current = document.createElement('div'), next = document.createElement('div'), notes = document.createElement('div');
 current.className = 'presenter-current'; next.className = 'presenter-next'; notes.className = 'presenter-notes';
 const button = (parent: HTMLElement, label: string, fn: () => void) => { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',fn); parent.append(b); };
 const sendAction = (action: 'next' | 'prev' | 'first' | 'last' | 'leave') => { if (state) send(state.owner, {action}); };
 header.append(counter,timer,clock); button(header,'Pause',()=>{ paused=!paused; lastTick=Date.now(); }); button(header,'Reset',()=>{elapsed=0; started=false; lastTick=Date.now(); updateTime();});
 const body = document.createElement('div'); body.className='presenter-body'; const right = document.createElement('div'); right.className='presenter-right';
 const sizes = document.createElement('div'); button(sizes,'A−',()=>{if(state) send(state.owner,{notesSize:Math.max(14,state.notesSize-2)});}); button(sizes,'A+',()=>{if(state) send(state.owner,{notesSize:Math.min(32,state.notesSize+2)});}); right.append(next,sizes,notes); body.append(current,right);
 const controls = document.createElement('footer'); button(controls,'Previous',()=>sendAction('prev')); button(controls,'Next',()=>sendAction('next')); root.append(header,body,controls); host.append(root);
 function updateTime() { const seconds=Math.floor(elapsed/1000); timer.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; clock.textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
 const interval=setInterval(()=>{ const now=Date.now(); if(started && !paused) elapsed+=now-lastTick; lastTick=now; updateTime(); },1000); updateTime();
 function renderSlide(element: HTMLElement, source: string, path: string | null) { element.innerHTML=renderMarkdown(source); element.querySelectorAll('a').forEach(a=>a.tabIndex=-1); enhancePreviewTasks(element,null); resolvePreviewImages(element,path); void enhancePreview(element); }
 root.addEventListener('click',e=>{if ((e.target as Element).closest('a')) e.preventDefault();});
 const reader=createKeyReader(Date.now); const key=(e:KeyboardEvent)=>{const action=reader.read(e); if(action && typeof action==='string' && ['next','prev','first','last','leave'].includes(action)){e.preventDefault();sendAction(action as 'next'|'prev'|'first'|'last'|'leave');}}; window.addEventListener('keydown',key,true);
 return { update(value: unknown) { const incoming=parsePresenterState(value); if(!incoming) return; if(state && incoming.index!==state.index && !started) {started=true;lastTick=Date.now();} state=incoming; root.classList.toggle('light',state.theme==='light'); counter.textContent=`${state.index+1} / ${state.total}`; renderSlide(current,state.current,state.notePath); if(state.next===null) next.textContent='End of presentation'; else renderSlide(next,state.next,state.notePath); notes.textContent=state.notes || 'No notes for this slide.'; notes.style.fontSize=`${state.notesSize}px`; }, destroy(){clearInterval(interval);window.removeEventListener('keydown',key,true);root.remove();} };
}
const host=document.getElementById('presenter');
if (host) {
 const presenter=createPresenter(host,(owner,command)=>{void emitTo(owner,PRESENTER_COMMAND,command);});
 void listen(PRESENTER_STATE,event=>presenter.update(event.payload)).then(()=>emit(PRESENTER_READY,{}));
}

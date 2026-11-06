'use client';
import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'min'|'max'|'step'> & {value:string;onValueChange:(value:string)=>void};
function display(value:string){
  const [whole,fraction]=value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fraction!==undefined?','+fraction:'');
}
// Tampilan Indonesia: 12.500,50. State/API tetap desimal kanonis: 12500.50.
export default function MoneyInput({value,onValueChange,...props}:Props){
  const input=useRef<HTMLInputElement>(null);
  const caret=useRef<number|null>(null);
  useLayoutEffect(()=>{
    if(caret.current===null||!input.current)return;
    const text=input.current.value;let count=0,index=0;
    while(index<text.length&&count<caret.current){if(text[index]!=='.')count++;index++;}
    input.current.setSelectionRange(index,index);caret.current=null;
  });
  return <input {...props} ref={input} type="text" inputMode="decimal" value={display(value)}
    onChange={e=>{
      const text=e.target.value;const raw=text.replace(/\./g,'');
      if(!/^\d*(,\d{0,2})?$/.test(raw))return;
      let canonical=raw.replace(',','.');
      if(canonical.startsWith('.'))canonical='0'+canonical;
      canonical=canonical.replace(/^0+(?=\d)/,'');
      if((canonical.split('.')[0]??'').length>9)return;
      caret.current=text.slice(0,e.target.selectionStart??text.length).replace(/\./g,'').length;
      onValueChange(canonical);
    }}
    onBlur={e=>{if(value){const [whole,fraction='']=value.split('.');onValueChange(whole+'.'+fraction.padEnd(2,'0'));}props.onBlur?.(e);}}
  />;
}

'use client';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';

type Option={value:string;label:string;disabled?:boolean};
type Props={
  value:string;
  options:Option[];
  onChange:(value:string)=>void;
  placeholder:string;
  ariaLabel:string;
  required?:boolean;
};

/** Search existing options while preserving a real option value for form validation. */
export default function SearchableSelect({value,options,onChange,placeholder,ariaLabel,required=false}:Props){
  const listId=useId();
  const inputRef=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [active,setActive]=useState(-1);
  const [menuStyle,setMenuStyle]=useState<React.CSSProperties>({});
  const selected=options.find(option=>option.value===value);
  const shownValue=open?(search||selected?.label||''):(selected?.label||'');
  const filtered=options.filter(option=>!option.disabled&&option.label.toLocaleLowerCase().includes((search||selected?.label||'').trim().toLocaleLowerCase()));

  useEffect(()=>{
    if(!open)return;
    const positionMenu=()=>{
      const rect=inputRef.current?.getBoundingClientRect();
      if(!rect)return;
      const below=window.innerHeight-rect.bottom-8;
      const above=rect.top-8;
      const useBelow=below>=Math.min(180,above)||above<180;
      const height=Math.max(100,Math.min(240,useBelow?below:above));
      setMenuStyle({position:'fixed',left:rect.left,top:useBelow?rect.bottom+4:Math.max(8,rect.top-height-4),width:rect.width,right:'auto',maxHeight:height,zIndex:1000});
    };
    positionMenu();
    window.addEventListener('resize',positionMenu);
    window.addEventListener('scroll',positionMenu,true);
    return ()=>{window.removeEventListener('resize',positionMenu);window.removeEventListener('scroll',positionMenu,true);};
  },[open,search,selected?.label]);

  function choose(option:Option){
    if(option.disabled)return;
    onChange(option.value);setSearch('');setOpen(false);setActive(-1);
    inputRef.current?.setCustomValidity('');
  }

  return <div className="creatable-select">
    <div className="creatable-select-control">
      <input ref={inputRef} role="combobox" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={open}
        aria-controls={listId} aria-activedescendant={open&&active>=0?`${listId}-option-${active}`:undefined}
        autoComplete="off" required={required} value={shownValue} placeholder={placeholder}
        onFocus={event=>{setSearch(selected?.label||'');setOpen(true);setActive(-1);event.currentTarget.select();}}
        onBlur={()=>{setOpen(false);setSearch('');setActive(-1);}}
        onChange={event=>{setSearch(event.target.value);onChange('');setOpen(true);setActive(-1);event.currentTarget.setCustomValidity(required?'Pilih jenis plastik dari daftar.':'');}}
        onKeyDown={event=>{
          if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(index=>Math.min(index+1,filtered.length-1));}
          else if(event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(index-1,0));}
          else if(event.key==='Escape'){setOpen(false);setSearch('');setActive(-1);}
          else if(event.key==='Enter'&&open&&active>=0&&filtered[active]){event.preventDefault();choose(filtered[active]);}
        }}/>
      <button type="button" className="creatable-select-toggle" aria-label={`Tampilkan pilihan ${ariaLabel}`} aria-expanded={open}
        onMouseDown={event=>event.preventDefault()} onClick={()=>{if(open){setOpen(false);setSearch('');}else{setSearch(selected?.label||'');setOpen(true);}setActive(-1);}}>▾</button>
    </div>
    {open&&typeof document!=='undefined'&&createPortal(
      <div className="creatable-select-menu" id={listId} role="listbox" aria-label={`Pilihan ${ariaLabel}`} style={menuStyle}>
        {filtered.length?filtered.map((option,index)=><button type="button" role="option" aria-selected={value===option.value} aria-disabled={option.disabled||undefined}
          id={`${listId}-option-${index}`} key={option.value} disabled={option.disabled} className={active===index?'creatable-select-option active':'creatable-select-option'}
          onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(option)}>{option.label}</button>)
          :<p className="creatable-select-empty">Tidak ada plastik yang cocok. Ubah kata pencarian.</p>}
      </div>,document.body)}
  </div>;
}

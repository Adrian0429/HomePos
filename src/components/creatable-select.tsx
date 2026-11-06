'use client';
import { useId, useState } from 'react';

type Props={
  value:string;
  options:string[];
  onChange:(value:string)=>void;
  placeholder:string;
  ariaLabel:string;
  required?:boolean;
  maxLength?:number;
};

/** Searchable dropdown that also accepts a new value typed into the field. */
export default function CreatableSelect({value,options,onChange,placeholder,ariaLabel,required=false,maxLength=160}:Props){
  const listId=useId();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const filtered=options.filter(option=>option.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  function choose(option:string){onChange(option);setOpen(false);setActive(-1);}

  return <div className="creatable-select">
    <div className="creatable-select-control">
      <input role="combobox" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={open}
        aria-controls={listId} aria-activedescendant={open&&active>=0?`${listId}-option-${active}`:undefined}
        autoComplete="off" required={required} maxLength={maxLength} value={value} placeholder={placeholder}
        onFocus={()=>{setOpen(true);setActive(-1);}}
        onBlur={()=>setOpen(false)}
        onChange={event=>{onChange(event.target.value);setOpen(true);setActive(-1);}}
        onKeyDown={event=>{
          if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setActive(index=>Math.min(index+1,filtered.length-1));}
          else if(event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(index=>Math.max(index-1,0));}
          else if(event.key==='Escape'){setOpen(false);setActive(-1);}
          else if(event.key==='Enter'&&open&&active>=0&&filtered[active]){event.preventDefault();choose(filtered[active]);}
        }}/>
      <button type="button" className="creatable-select-toggle" aria-label={`Tampilkan pilihan ${ariaLabel}`} aria-expanded={open}
        onMouseDown={event=>event.preventDefault()} onClick={()=>{setOpen(current=>!current);setActive(-1);}}>▾</button>
    </div>
    {open&&<div className="creatable-select-menu" id={listId} role="listbox" aria-label={`Pilihan ${ariaLabel}`}>
      {filtered.length?filtered.map((option,index)=><button type="button" role="option" aria-selected={value===option}
        id={`${listId}-option-${index}`} key={option} className={active===index?'creatable-select-option active':'creatable-select-option'}
        onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(option)}>{option}</button>)
        :<p className="creatable-select-empty">{value.trim()?'Nama baru — tekan Enter atau lanjutkan mengisi.':'Belum ada nama tersimpan. Ketik nama baru di kolom ini.'}</p>}
    </div>}
  </div>;
}

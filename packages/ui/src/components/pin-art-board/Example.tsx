import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PinArtBoard } from './PinArtBoard';
export default function Example({ onFeedback }: { onFeedback?: () => void }) {
  const [erase,setErase]=useState(false),[slow,setSlow]=useState(false),[reset,setReset]=useState(0);
  const button=(text:string,fn:()=>void,active=false)=><Pressable accessibilityRole="button" accessibilityState={{selected:active}} onPress={fn} style={{minHeight:44,paddingHorizontal:13,justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:'#cbd1d5',backgroundColor:active?'#273942':'#f1f3f4'}}><Text style={{fontFamily:'Geist-Regular',fontSize:12,color:active?'#fff':'#25323a'}}>{text}</Text></Pressable>;
  return <View style={{alignItems:'center',gap:14}}><PinArtBoard erase={erase} slowMotion={slow} resetKey={reset} onFeedback={onFeedback}/><View style={{flexDirection:'row',gap:8}}>{button(erase?'Erase':'Sculpt',()=>setErase(v=>!v),erase)}{button('Wipe flat',()=>setReset(v=>v+1))}{button(`Slow motion: ${slow?'on':'off'}`,()=>setSlow(v=>!v),slow)}</View><Text style={{fontFamily:'Geist-Regular',fontSize:12,color:'#71808a'}}>Press and drag. The pins hold your impression.</Text></View>;
}

import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
export function ShatterUnavailable({message,width,height,style}:{message:string;width:number;height:number;style?:ViewStyle}) {
 return <View style={[{width,height,justifyContent:'center',padding:24,borderRadius:18,backgroundColor:'#0b1426'},style]}><Text accessibilityRole="alert" style={{color:'#f3f6ff',fontSize:16,lineHeight:24}}>{message}</Text></View>;
}

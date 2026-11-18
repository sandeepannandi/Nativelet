import React from 'react';
import {View,ScrollView} from 'react-native';
import {Link} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/water-tank/Example';
export default function WaterScreen(){const inset=useSafeAreaInsets();return <View style={{flex:1,backgroundColor:'#e8eeeb',paddingTop:inset.top+20,paddingBottom:inset.bottom+12}}><Link href="/" style={{marginHorizontal:24,color:'#315954'}}>← Components</Link><ScrollView scrollEnabled={false} contentContainerStyle={{flexGrow:1,justifyContent:'center',alignItems:'center'}}><Example/></ScrollView></View>;}

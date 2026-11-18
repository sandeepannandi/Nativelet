import React from 'react';
import {View,ScrollView} from 'react-native';
import {Link} from 'expo-router';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Example from '../../../packages/ui/src/components/zipper-reveal/Example';
export default function ZipperScreen(){const inset=useSafeAreaInsets();return <View style={{flex:1,backgroundColor:'#f3f6ee',paddingTop:inset.top+20,paddingBottom:inset.bottom+12}}><Link href='/' style={{marginHorizontal:24,color:'#31513b'}}>← Components</Link><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center',alignItems:'center'}}><Example/></ScrollView></View>;}

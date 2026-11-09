import React from 'react';
import {View} from 'react-native';
import {Gyroscope,type GyroscopeProps} from './Gyroscope';
export default function Example(props:GyroscopeProps){return <View style={{alignItems:'center',padding:12}}><Gyroscope {...props}/></View>;}

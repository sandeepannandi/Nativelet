import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PreviewRail } from '../../../packages/ui/src/components/preview-rail/PreviewRail';
import { SourcePanel } from '../src/web/SourcePanel';
const items = [
  { id: 'focus', label: 'Focus', description: 'Make room for one thing at a time.', number: '01', glyph: '◉', color: '#def0cb' },
  { id: 'listen', label: 'Listen', description: 'Find a little space in your day.', number: '02', glyph: '≋', color: '#d5e5f2' },
  { id: 'move', label: 'Move', description: 'Step outside. Start again.', number: '03', glyph: '↗', color: '#f4ddc7' },
  { id: 'rest', label: 'Rest', description: 'There is no rush to begin again.', number: '04', glyph: '☾', color: '#e4daf1' },
  { id: 'create', label: 'Create', description: 'Follow a thought somewhere new.', number: '05', glyph: '✳', color: '#f0e9c3' },
];
export default function ShowcaseHome() {
  const [activeId, setActiveId] = useState('focus');
  const [orientation, setOrientation] = useState<'vertical'|'horizontal'>('vertical');
  const [reduce, setReduce] = useState<boolean | undefined>();
  const pageRef = useRef<ScrollView>(null);
  // Vertical rail only: hold the page still while a finger is on the strip, so a vertical drag cannot be taken by the page scroller. Set natively and restored on touch end/cancel.
  const holdPage = (hold: boolean) => { if (orientation === 'vertical') (pageRef.current as any)?.setNativeProps?.({ scrollEnabled: !hold }); };
  return <SafeAreaView style={styles.page}><ScrollView ref={pageRef} contentContainerStyle={styles.content}>
    <View style={styles.header}><Text style={styles.brand}>nativelet</Text><Text style={styles.badge}>NATIVE STUDY / 01</Text></View>
    <Link href="/pottery-wheel" style={styles.note}>New: Pottery Wheel →</Link>
    <Link href="/zipper-reveal" style={styles.note}>New: Zipper Reveal →</Link>
    <Link href="/glass" style={styles.note}>New: Liquid Tabs →</Link>
    <Link href="/capsule" style={styles.note}>Next: Morph Capsule →</Link>
    <Text accessibilityRole="header" style={styles.title}>{'A small rail.\nA world of previews.'}</Text>
    <Text style={styles.subtitle}>Press a tick. Drag to explore. Release to choose.</Text>
    <View style={styles.pills}>{(['vertical', 'horizontal'] as const).map(o => <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: orientation === o }} onPress={() => setOrientation(o)} style={[styles.pill, orientation === o && styles.pillOn]}><Text style={[styles.pillText, orientation === o && styles.pillTextOn]}>{o === 'vertical' ? 'Vertical' : 'Horizontal'}</Text></Pressable>)}</View>
    <View style={styles.demo}>
      <View style={styles.demoHeader}><Text style={styles.eyebrow}>PREVIEW RAIL</Text><Text style={styles.platform}>{Platform.OS === 'web' ? 'React Native Web preview' : 'Native demo'}</Text></View>
      <PreviewRail items={items} activeId={activeId} onActiveChange={setActiveId} orientation={orientation} reducedMotion={reduce}
        onTouchBegin={() => holdPage(true)} onTouchFinish={() => holdPage(false)}
        onSelectionFeedback={() => { if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {}); }}
        renderPreview={item => <View style={[styles.card, { backgroundColor: item.color }]}>
          <Text style={styles.cardNumber}>{item.number} / DAILY RITUALS</Text>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.glyph}>{item.glyph}</Text>
          <Text accessibilityRole="header" style={styles.cardTitle}>{item.label}</Text><Text style={styles.cardDescription}>{item.description}</Text>
          <View style={styles.cardFooter}><Text style={styles.cardFooterText}>Take a moment</Text><Text style={styles.cardFooterText}>↗</Text></View>
        </View>} />
      <Text style={styles.selected}>Selected: {items.find(item => item.id === activeId)?.label}</Text>
    </View>
    <View style={styles.options}>
      <Pressable accessibilityRole="button" onPress={() => setReduce(reduce === true ? undefined : true)} style={styles.option}><Text style={styles.optionText}>{reduce === true ? 'Motion: reduced' : 'Motion: system'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => { setActiveId('focus'); setOrientation('vertical'); setReduce(undefined); }} style={styles.option}><Text style={styles.optionText}>Reset</Text></Pressable>
    </View>
    <Text style={styles.note}>One native source, not a DOM imitation. Keyboard and press controls are alternatives to dragging. Optional haptics run only on native.</Text>
    {Platform.OS === 'web' ? <SourcePanel /> : <Text style={styles.note}>Source and usage are in packages/ui/src/components/preview-rail. Clipboard UI is web-only.</Text>}
    <Text style={styles.note}>Verified here: TypeScript, helper tests and web rendering. Not device-verified: iOS, Android, screen readers and haptics. No backend or deployment.</Text>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f8f4' }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 24, paddingTop: 42, gap: 24 },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, brand: { fontSize: 24, fontWeight: '700', letterSpacing: -1, color: '#193f30' },
  badge: { fontSize: 10, letterSpacing: 1, color: '#456345' }, title: { fontSize: 44, lineHeight: 48, letterSpacing: -1.8, fontWeight: '700', color: '#193f30', marginTop: 24 },
  subtitle: { color: '#4b6053', fontSize: 16, lineHeight: 25 }, demo: { backgroundColor: '#fff', borderRadius: 28, padding: 20, gap: 24, borderWidth: 1, borderColor: '#d5e1d2' },
  demoHeader: { gap: 6 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: '#31533e' }, platform: { fontSize: 11, color: '#52654f' },
  card: { borderRadius: 24, padding: 20, gap: 14, minHeight: 300 }, cardNumber: { fontSize: 9, letterSpacing: 1, color: '#36543d', fontWeight: '700' },
  glyph: { fontSize: 64, lineHeight: 76, color: '#254934', marginVertical: 6 }, cardTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -1, color: '#193f30' }, cardDescription: { color: '#3d5644', fontSize: 14, lineHeight: 22 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#abc79f', paddingTop: 14, marginTop: 4 }, cardFooterText: { color: '#2a4934', fontSize: 11, fontWeight: '600' },
  selected: { color: '#486045', fontSize: 12 }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, option: { paddingHorizontal: 12, minHeight: 44, borderRadius: 14, backgroundColor: '#e6edde', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 8, marginBottom: -8 }, pill: { paddingHorizontal: 16, minHeight: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e1d2', justifyContent: 'center' }, pillOn: { backgroundColor: '#193f30', borderColor: '#193f30' },
  pillText: { fontSize: 12, color: '#193f30' }, pillTextOn: { color: '#fff' },
  optionText: { fontSize: 12, color: '#31513b', fontWeight: '600' }, note: { color: '#4b6053', fontSize: 13, lineHeight: 22 },
});

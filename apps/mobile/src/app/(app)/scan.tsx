import type { BarcodeType } from '@calorie-tracker/core';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { lookupBarcode, type LookupResult } from '@/lib/food-lookup';
import { isMeal } from '@/hooks/use-log';
import { today } from '@/lib/dates';

const SCAN_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e'];

function isBarcodeType(value: string): value is BarcodeType {
  return SCAN_TYPES.includes(value as BarcodeType);
}

export default function ScanScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const meal = isMeal(params.meal) ? params.meal : 'snack';
  const date = params.date || today();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Camera callbacks fire many times per second; the ref blocks duplicates before state updates.
  const busy = useRef(false);

  async function handle(raw: string, type?: BarcodeType) {
    if (busy.current) return;
    busy.current = true;
    setIsLooking(true);
    setMessage(null);
    let result: LookupResult;
    try {
      result = await lookupBarcode(raw, type);
    } catch {
      result = { status: 'unavailable' };
    }
    setIsLooking(false);

    switch (result.status) {
      case 'found':
        router.replace({ pathname: '/food/[id]', params: { id: result.food.id, meal, date } });
        return;
      case 'not_found':
        router.replace({ pathname: '/food/new', params: { meal, date, barcode: result.barcode } });
        return;
      case 'incomplete':
        router.replace({
          pathname: '/food/new',
          params: { meal, date, barcode: result.barcode, draft: JSON.stringify(result.draft), incomplete: '1' },
        });
        return;
      case 'in_store':
        setMessage(t('scan.inStore'));
        break;
      case 'invalid_barcode':
        setMessage(t('scan.invalid'));
        break;
      default:
        setMessage(t('scan.unavailable'));
    }
    busy.current = false;
  }

  function onScanned(scan: BarcodeScanningResult) {
    void handle(scan.data, isBarcodeType(scan.type) ? scan.type : undefined);
  }

  return (
    <Screen>
      {permission?.granted ? (
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: SCAN_TYPES }}
            onBarcodeScanned={isLooking || message ? undefined : onScanned}
          />
        </View>
      ) : permission ? (
        <Card>
          <ThemedText>{t('scan.permission')}</ThemedText>
          {permission.canAskAgain && <Button label={t('scan.allowCamera')} onPress={requestPermission} />}
        </Card>
      ) : null}

      {isLooking && (
        <View style={styles.status}>
          <ActivityIndicator />
          <ThemedText>{t('scan.looking')}</ThemedText>
        </View>
      )}
      {message && (
        <Card>
          <ThemedText>{message}</ThemedText>
          <Button variant="secondary" label={t('scan.scanAgain')} onPress={() => setMessage(null)} />
        </Card>
      )}

      <Field
        label={t('scan.manualLabel')}
        value={manual}
        onChangeText={(value) => setManual(value.replace(/[^\d]/g, '').slice(0, 14))}
        keyboardType="number-pad"
        placeholder="5901234123457"
        onSubmitEditing={() => handle(manual)}
      />
      <Button
        label={t('scan.lookUp')}
        onPress={() => handle(manual)}
        disabled={manual.length < 8}
        isBusy={isLooking}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    aspectRatio: 4 / 3,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  status: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
});

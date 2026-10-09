import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Card, ListRow } from '@/components/ui';

// Attribution required by the Open Food Facts licence (ODbL) and asked for by the BLS terms.
const SOURCES = [
  {
    key: 'off',
    links: [
      { key: 'website', url: 'https://world.openfoodfacts.org' },
      { key: 'licence', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    ],
  },
  {
    key: 'bls',
    links: [{ key: 'website', url: 'https://doi.org/10.25826/Data20251217-134202-0' }],
  },
] as const;

export default function SourcesScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">{t('sources.intro')}</ThemedText>
      {SOURCES.map((source) => (
        <Card key={source.key}>
          <ThemedText type="smallBold">{t(`sources.${source.key}.name`)}</ThemedText>
          <ThemedText type="small">{t(`sources.${source.key}.body`)}</ThemedText>
          {source.links.map((link) => (
            <ListRow
              key={link.key}
              title={t(`sources.${source.key}.${link.key}`)}
              trailing={<ThemedText themeColor="textSecondary">↗</ThemedText>}
              onPress={() => WebBrowser.openBrowserAsync(link.url)}
            />
          ))}
        </Card>
      ))}
      <Card>
        <ThemedText type="smallBold">{t('sources.custom.name')}</ThemedText>
        <ThemedText type="small">{t('sources.custom.body')}</ThemedText>
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        {t('sources.disclaimer')}
      </ThemedText>
    </Screen>
  );
}

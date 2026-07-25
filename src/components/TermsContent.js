import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../context/SettingsContext';

export default function TermsContent({ terms }) {
  const { colors, language } = useTheme();
  const ar = language === 'ar';

  const title       = ar ? terms.titleAr       : terms.title;
  const lastUpdated = ar ? terms.lastUpdatedAr  : terms.lastUpdated;

  return (
    <>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.dark, marginBottom: 4, textAlign: ar ? 'right' : 'left' }}>
        {title}
      </Text>
      <Text style={{ fontSize: 12, color: colors.gray, fontStyle: 'italic', marginBottom: 20, textAlign: ar ? 'right' : 'left' }}>
        {lastUpdated}
      </Text>

      {terms.sections.map((section, si) => {
        const heading = ar ? section.headingAr : section.heading;
        return (
          <View key={si} style={{ marginBottom: 18 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.dark, marginBottom: 8, textAlign: ar ? 'right' : 'left' }}>
              {heading}
            </Text>

            {section.content.map((item, ci) => {
              const value = ar ? (item.valueAr ?? item.value) : item.value;
              const label = item.label ? (ar ? (item.labelAr ?? item.label) : item.label) : null;

              if (item.type === 'text') {
                return (
                  <Text
                    key={ci}
                    style={{ fontSize: 13.5, color: colors.dark, lineHeight: 22, marginBottom: 6, textAlign: ar ? 'right' : 'left' }}
                  >
                    {value}
                  </Text>
                );
              }

              if (item.type === 'bullet') {
                return (
                  <View key={ci} style={{ flexDirection: ar ? 'row-reverse' : 'row', marginBottom: 8, paddingLeft: ar ? 0 : 4, paddingRight: ar ? 4 : 0 }}>
                    <Text style={{ fontSize: 15, color: colors.primary, marginLeft: ar ? 8 : 0, marginRight: ar ? 0 : 8, lineHeight: 22 }}>
                      •
                    </Text>
                    <Text style={{ flex: 1, fontSize: 13.5, color: colors.dark, lineHeight: 22, textAlign: ar ? 'right' : 'left' }}>
                      {label
                        ? <><Text style={{ fontWeight: '700' }}>{label}: </Text>{value}</>
                        : value}
                    </Text>
                  </View>
                );
              }

              return null;
            })}
          </View>
        );
      })}
    </>
  );
}

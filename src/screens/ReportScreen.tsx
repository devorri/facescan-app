import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Share2,
  X,
  XCircle,
} from 'lucide-react-native';
import { AppButton } from '../components/AppButton';
import { PickerField, type PickerOption } from '../components/PickerField';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { listFaculty } from '../services/facultyService';
import { listLaboratories } from '../services/laboratoryService';
import { generatePrintableReportHtml } from '../services/reportHtmlGenerator';
import {
  type AccessReportItem,
  type ReportFilter,
  type ReportResult,
  getAccessReportData,
} from '../services/reportService';
import type { Laboratory, Profile } from '../types/database';

type DatePreset = 'today' | 'yesterday' | 'week' | 'month';

export function ReportScreen() {
  // Filter state
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [selectedLabId, setSelectedLabId] = useState<string>('all');
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'granted' | 'denied' | 'late' | 'exited'>('all');
  const [activePreset, setActivePreset] = useState<DatePreset>('today');

  // iOS / Web date picker modal state
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);

  // Data states
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [facultyList, setFacultyList] = useState<Profile[]>([]);
  const [labList, setLabList] = useState<Laboratory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingPrint, setGeneratingPrint] = useState<boolean>(false);
  const [sharingPdf, setSharingPdf] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load initial dropdown options (faculty and labs)
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [facs, labs] = await Promise.all([listFaculty(), listLaboratories()]);
        setFacultyList(facs);
        setLabList(labs);
      } catch (err: any) {
        console.warn('Failed to load filter options:', err.message);
      }
    }
    loadDropdowns();
  }, []);

  // Fetch report data
  const loadReport = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const filters: ReportFilter = {
        dateFrom,
        dateTo,
        laboratoryId: selectedLabId === 'all' ? undefined : selectedLabId,
        facultyId: selectedFacultyId === 'all' ? undefined : selectedFacultyId,
        statusFilter,
      };
      const result = await getAccessReportData(filters);
      setReportResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate report data.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedLabId, selectedFacultyId, statusFilter]);

  // Reload report whenever filters change
  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Preset handlers
  const applyPreset = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date();
    const from = new Date();
    const to = new Date();
    to.setHours(23, 59, 59, 999);

    if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (preset === 'yesterday') {
      from.setDate(now.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setDate(now.getDate() - 1);
    } else if (preset === 'week') {
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
    } else if (preset === 'month') {
      from.setDate(1); // 1st day of current month
      from.setHours(0, 0, 0, 0);
    }

    setDateFrom(from);
    setDateTo(to);
  };

  // Date picker handler for Android
  const openAndroidDatePicker = (target: 'from' | 'to') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: target === 'from' ? dateFrom : dateTo,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            if (target === 'from') {
              selectedDate.setHours(0, 0, 0, 0);
              setDateFrom(selectedDate);
            } else {
              selectedDate.setHours(23, 59, 59, 999);
              setDateTo(selectedDate);
            }
          }
        },
      });
    } else {
      setDatePickerTarget(target);
    }
  };

  // Trigger Native / Web Print
  const handlePrint = async () => {
    if (!reportResult) return;
    setGeneratingPrint(true);
    try {
      const html = generatePrintableReportHtml(reportResult);
      await Print.printAsync({
        html,
        orientation: Print.Orientation.landscape,
      });
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Could not print report.');
    } finally {
      setGeneratingPrint(false);
    }
  };

  // Trigger Save / Share PDF
  const handleSharePdf = async () => {
    if (!reportResult) return;
    setSharingPdf(true);
    try {
      const html = generatePrintableReportHtml(reportResult);
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
          dialogTitle: 'Share Faculty Access Report',
        });
      } else {
        Alert.alert(
          'PDF Generated',
          `Report PDF saved successfully.\nFile location: ${uri}`,
        );
      }
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Could not export PDF report.');
    } finally {
      setSharingPdf(false);
    }
  };

  // Options for pickers
  const labOptions: PickerOption[] = [
    { label: 'All Laboratories', value: 'all' },
    ...labList.map((l) => ({ label: l.name, value: l.id })),
  ];

  const facultyOptions: PickerOption[] = [
    { label: 'All Faculty Members', value: 'all' },
    ...facultyList.map((f) => ({ label: `${f.name} (${f.role})`, value: f.id })),
  ];

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.heading}>Access Reports</Text>
          <Text style={styles.subheading}>
            Generate & print printable faculty laboratory logs with punctuality tracking
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={loadReport}
          activeOpacity={0.7}
        >
          <RefreshCw size={18} color={Colors.blue} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter Controls Card */}
        <View style={[styles.card, Shadow.sm]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderTitle}>
              <Filter size={16} color={Colors.blue} />
              <Text style={styles.cardTitle}>Report Criteria & Filters</Text>
            </View>
          </View>

          {/* Quick Date Presets */}
          <Text style={styles.inputSectionLabel}>Date Range Period</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetChip, activePreset === 'today' && styles.presetChipActive]}
              onPress={() => applyPreset('today')}
            >
              <Text style={[styles.presetChipText, activePreset === 'today' && styles.presetChipTextActive]}>
                Today
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, activePreset === 'yesterday' && styles.presetChipActive]}
              onPress={() => applyPreset('yesterday')}
            >
              <Text style={[styles.presetChipText, activePreset === 'yesterday' && styles.presetChipTextActive]}>
                Yesterday
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, activePreset === 'week' && styles.presetChipActive]}
              onPress={() => applyPreset('week')}
            >
              <Text style={[styles.presetChipText, activePreset === 'week' && styles.presetChipTextActive]}>
                Past 7 Days
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, activePreset === 'month' && styles.presetChipActive]}
              onPress={() => applyPreset('month')}
            >
              <Text style={[styles.presetChipText, activePreset === 'month' && styles.presetChipTextActive]}>
                This Month
              </Text>
            </TouchableOpacity>
          </View>

          {/* Custom Date Pickers */}
          <View style={styles.datePickerRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>From Date</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => openAndroidDatePicker('from')}
                activeOpacity={0.7}
              >
                <Calendar size={16} color={Colors.blue} />
                <Text style={styles.dateBtnText}>
                  {dateFrom.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>To Date</Text>
              <TouchableOpacity
                style={styles.dateBtn}
                onPress={() => openAndroidDatePicker('to')}
                activeOpacity={0.7}
              >
                <Calendar size={16} color={Colors.blue} />
                <Text style={styles.dateBtnText}>
                  {dateTo.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Laboratory & Faculty Pickers */}
          <View style={styles.dropdownsGrid}>
            <PickerField
              label="Laboratory"
              emptyLabel="Select laboratory"
              options={labOptions}
              value={selectedLabId}
              onChange={(val) => setSelectedLabId(val)}
            />

            <PickerField
              label="Faculty Member"
              emptyLabel="Select faculty"
              options={facultyOptions}
              value={selectedFacultyId}
              onChange={(val) => setSelectedFacultyId(val)}
            />
          </View>

          {/* Status Filter Chips */}
          <Text style={styles.inputSectionLabel}>Filter By Status</Text>
          <View style={styles.statusChipsRow}>
            {(['all', 'granted', 'denied', 'late', 'exited'] as const).map((s) => {
              const isSelected = statusFilter === s;
              const labels: Record<string, string> = {
                all: 'All',
                granted: 'Granted',
                denied: 'Denied',
                late: 'Late (>15m)',
                exited: 'Exited',
              };
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusChip, isSelected && styles.statusChipActive]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.statusChipText, isSelected && styles.statusChipTextActive]}>
                    {labels[s]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Action Buttons for Print & PDF Share */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.printBtn, Shadow.sm]}
            onPress={handlePrint}
            disabled={generatingPrint || loading}
            activeOpacity={0.8}
          >
            {generatingPrint ? (
              <ActivityIndicator color={Colors.textWhite} size="small" />
            ) : (
              <>
                <Printer size={18} color={Colors.textWhite} />
                <Text style={styles.actionBtnText}>Print Report</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.exportBtn, Shadow.sm]}
            onPress={handleSharePdf}
            disabled={sharingPdf || loading}
            activeOpacity={0.8}
          >
            {sharingPdf ? (
              <ActivityIndicator color={Colors.textWhite} size="small" />
            ) : (
              <>
                <Share2 size={18} color={Colors.textWhite} />
                <Text style={styles.actionBtnText}>Export / Share PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <AlertCircle size={18} color={Colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Live Metrics Summary Cards */}
        {reportResult && (
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, styles.metricCardTotal]}>
              <Text style={styles.metricVal}>{reportResult.summary.totalLogs}</Text>
              <Text style={styles.metricLabel}>Total Logs</Text>
            </View>

            <View style={[styles.metricCard, styles.metricCardGranted]}>
              <Text style={[styles.metricVal, { color: Colors.success }]}>
                {reportResult.summary.totalGranted}
              </Text>
              <Text style={styles.metricLabel}>Granted</Text>
            </View>

            <View style={[styles.metricCard, styles.metricCardDenied]}>
              <Text style={[styles.metricVal, { color: Colors.danger }]}>
                {reportResult.summary.totalDenied}
              </Text>
              <Text style={styles.metricLabel}>Denied</Text>
            </View>

            <View style={[styles.metricCard, styles.metricCardLate]}>
              <Text style={[styles.metricVal, { color: Colors.warning }]}>
                {reportResult.summary.totalLate}
              </Text>
              <Text style={styles.metricLabel}>Late (&gt;15m)</Text>
            </View>

            <View style={[styles.metricCard, styles.metricCardExited]}>
              <Text style={[styles.metricVal, { color: Colors.blue }]}>
                {reportResult.summary.totalExited}
              </Text>
              <Text style={styles.metricLabel}>Exited</Text>
            </View>
          </View>
        )}

        {/* Preview List of Matching Records */}
        <View style={[styles.card, Shadow.sm]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderTitle}>
              <FileSpreadsheet size={16} color={Colors.blue} />
              <Text style={styles.cardTitle}>Report Preview ({reportResult?.items.length ?? 0} records)</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.blue} size="small" />
              <Text style={styles.loadingText}>Compiling report data and checking schedules…</Text>
            </View>
          ) : !reportResult || reportResult.items.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No access records found</Text>
              <Text style={styles.emptySub}>
                Try selecting a broader date range or adjust your filters above.
              </Text>
            </View>
          ) : (
            <View style={styles.previewList}>
              {reportResult.items.map((item, index) => (
                <View key={item.id} style={styles.recordRow}>
                  <View style={styles.recordLeft}>
                    <View style={styles.recordMainRow}>
                      <Text style={styles.facultyName}>{item.facultyName}</Text>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: item.statusBadgeBg, borderColor: `${item.statusBadgeColor}40` },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: item.statusBadgeColor }]}>
                          {item.displayStatus.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.labName}>
                      🏫 {item.laboratoryName} {item.laboratoryLocation ? `• ${item.laboratoryLocation}` : ''}
                    </Text>

                    <View style={styles.timeInfoRow}>
                      <Text style={styles.timeInfoText}>
                        📅 {item.entryDateFormatted} • In: <Text style={styles.boldTime}>{item.entryTimeFormatted}</Text>
                      </Text>
                      <Text style={styles.timeInfoText}>
                        Out: <Text style={styles.boldTime}>{item.exitTimeFormatted}</Text>
                      </Text>
                    </View>

                    {item.remarks ? (
                      <Text style={styles.remarksText}>
                        💬 {item.remarks}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* iOS / Web Modal Date Picker */}
      {datePickerTarget && Platform.OS !== 'android' && (
        <Modal transparent animationType="fade" visible={Boolean(datePickerTarget)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Select {datePickerTarget === 'from' ? 'From' : 'To'} Date
                </Text>
                <TouchableOpacity onPress={() => setDatePickerTarget(null)}>
                  <X size={20} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              <DateTimePicker
                value={datePickerTarget === 'from' ? dateFrom : dateTo}
                mode="date"
                display="inline"
                onChange={(_, selectedDate) => {
                  if (selectedDate) {
                    if (datePickerTarget === 'from') {
                      selectedDate.setHours(0, 0, 0, 0);
                      setDateFrom(selectedDate);
                    } else {
                      selectedDate.setHours(23, 59, 59, 999);
                      setDateTo(selectedDate);
                    }
                  }
                  setDatePickerTarget(null);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitleWrap: {
    flex: 1,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subheading: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },

  // Cards
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  cardHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Presets
  inputSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  presetChipTextActive: {
    color: Colors.textWhite,
  },

  // Custom Date
  datePickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    gap: 4,
  },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    height: 40,
    paddingHorizontal: 10,
  },
  dateBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // Dropdowns
  dropdownsGrid: {
    gap: 10,
  },

  // Status Chips
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipActive: {
    backgroundColor: Colors.navyMid,
    borderColor: Colors.navyMid,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  statusChipTextActive: {
    color: Colors.textWhite,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  printBtn: {
    backgroundColor: Colors.navyMid,
  },
  exportBtn: {
    backgroundColor: Colors.blue,
  },
  actionBtnText: {
    color: Colors.textWhite,
    fontSize: 14,
    fontWeight: '700',
  },

  // Error Box
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Summary Metrics
  metricsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricCardTotal: {
    borderTopWidth: 3,
    borderTopColor: Colors.navyMid,
  },
  metricCardGranted: {
    borderTopWidth: 3,
    borderTopColor: Colors.success,
  },
  metricCardDenied: {
    borderTopWidth: 3,
    borderTopColor: Colors.danger,
  },
  metricCardLate: {
    borderTopWidth: 3,
    borderTopColor: Colors.warning,
  },
  metricCardExited: {
    borderTopWidth: 3,
    borderTopColor: Colors.blue,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Preview List
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptySub: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  previewList: {
    gap: 8,
  },
  recordRow: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordLeft: {
    gap: 4,
  },
  recordMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  facultyName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  labName: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  timeInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timeInfoText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  boldTime: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  remarksText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Mic, Loader2, Download, Check, AlertTriangle, Plus } from 'lucide-react';
import { DeliverableItem } from './deliverable-item';
import { type DeliverableSlot, extractEventDate, createDeliverableSlot } from '@/lib/deliverable-types';
import { generateDocx, downloadBlob } from '@/lib/document-utils';
import type { Expert } from '@/lib/types';

interface EventDocsPanelProps {
  deliverables: DeliverableSlot[];
  subActivity: string;
  activityTitle: string;
  date: string;
  description: string;
  expertName?: string;
  allExperts?: Expert[];
  currentExpertId?: string;
  onUpdateDeliverable: (id: string, patch: Partial<DeliverableSlot>) => void;
  onAddEventProof: () => void;
  onRemoveDeliverable: (id: string) => void;
  onUpsertSlot: (slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => void;
  canCheckEligibility?: boolean;
  eligibilityBlockedReason?: string;
  deliverableNotesMode?: 'inline' | 'external';
}

export function EventDocsPanel({
  deliverables,
  subActivity,
  activityTitle,
  date,
  description,
  expertName,
  allExperts = [],
  currentExpertId,
  onUpdateDeliverable,
  onAddEventProof,
  onRemoveDeliverable,
  onUpsertSlot,
  canCheckEligibility = true,
  eligibilityBlockedReason,
  deliverableNotesMode = 'inline',
}: EventDocsPanelProps) {
  const [hasMOM, setHasMOM] = useState(true);
  const [genDesc, setGenDesc] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; ds: string } | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Find event docs
  const eventMOM = deliverables.find(d => d.slotType === 'event_mom');
  const eventProofs = deliverables.filter(d => d.slotType === 'event_proof');
  const commonEventProof = eventProofs.find(d => d.isCommonDeliverable && !d.uploaded)
    || eventProofs.find(d => d.isCommonDeliverable);
  const localEventProofs = eventProofs.filter(d => !d.isCommonDeliverable || d.uploaded);
  const uploadedEventProofs = eventProofs.filter(d => d.uploaded);
  const eventReportPhotos = uploadedEventProofs
    .filter((proof) => proof.fileData && proof.fileType?.startsWith('image/'))
    .map((proof, index) => ({
      dataUrl: proof.fileData!,
      filename: proof.filename || proof.name || `Fotografie eveniment ${index + 1}`,
      altText: proof.declaredTitle || proof.filename || `Fotografie eveniment ${index + 1}`,
    }));

  const proofRequired = !hasMOM;
  const proofAtOtherExpert = !!commonEventProof?.isCommonDeliverable && !commonEventProof?.uploaded;
  const proofAtOtherExpertValid = proofAtOtherExpert && !!commonEventProof?.uploadedByExpertId;
  const proofSatisfied = !proofRequired || uploadedEventProofs.length > 0 || proofAtOtherExpertValid;
  const momSatisfied = hasMOM ? !!eventMOM?.uploaded : confirmed;
  const missingEventMOM = !momSatisfied;
  const missingEventProof = !proofSatisfied;
  const otherExperts = allExperts.filter((ex) => ex.id !== currentExpertId);
  const selectedProofExpert = otherExperts.find((ex) => ex.id === commonEventProof?.uploadedByExpertId);

  const buildFallbackReport = () => {
    const title = `Raport eveniment - ${activityTitle || date || 'activitate'}`;
    const formattedDate = date ? formatDate(date) || date : 'nespecificata';
    const photoSummary = eventReportPhotos.length > 0
      ? `${eventReportPhotos.length} fotografie/fotografii atasate in anexa foto.`
      : 'Nu au fost atasate fotografii in formular.';
    const content = [
      'RAPORT DE PARTICIPARE EVENIMENT',
      '',
      `Titlul activitatii: ${activityTitle || 'Nespecificat'}`,
      `Data: ${formattedDate}`,
      `Expert responsabil: ${expertName || 'Nespecificat'}`,
      `Subactivitate: ${subActivity || 'N/A'}`,
      '',
      '1. Context si scop',
      genDesc.trim(),
      '',
      '2. Desfasurarea evenimentului',
      genDesc.trim(),
      '',
      '3. Concluzii si rezultate',
      'Informatiile au fost consemnate pe baza descrierii introduse de expert si pot fi ajustate inainte de descarcare.',
      '',
      '4. Anexe',
      photoSummary,
    ].join('\n');

    return { title, content };
  };

  const applyReportPreview = (title: string, content: string) => {
    setPreviewTitle(title);
    setPreviewText(content);
    setPreview({ title, ds: date });
    setConfirmed(false);

    onUpsertSlot('event_mom', 'Raport de participare eveniment', {
      uploaded: false,
      filename: '',
      declaredTitle: title,
      isPendingConfirm: true,
    });
  };

  const generateReport = async () => {
    if (genDesc.trim().length < 20) {
      setGenErr('Descrierea trebuie sa aiba minim 20 caractere');
      return;
    }

    setGenLoading(true);
    setGenErr(null);
    setGenWarning(null);

    try {
      const response = await fetch('/api/ai/generate-event-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subActivity,
          activityTitle,
          date,
          expertName,
          description: genDesc,
          hasPhoto: uploadedEventProofs.length > 0,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Serviciul AI nu a putut genera raportul.');
      }
      const title = data.report?.eventTitle || `Raport eveniment - ${activityTitle || date}`;
      const content = data.momText || genDesc;

      applyReportPreview(title, content);
    } catch (err) {
      const fallback = buildFallbackReport();
      applyReportPreview(fallback.title, fallback.content);
      setGenWarning(
        `AI-ul nu a raspuns pentru raportul structurat (${err instanceof Error ? err.message : 'eroare necunoscuta'}). Am generat un raport editabil local.`
      );
    } finally {
      setGenLoading(false);
    }
  };

  const confirmReport = async () => {
    // Generate and download DOCX
    const blob = await generateDocx(previewTitle, previewText, { images: eventReportPhotos });
    const filename = `Raport_eveniment_${date}.docx`;
    downloadBlob(blob, filename);

    setConfirmed(true);
    onUpsertSlot('event_mom', 'Raport de participare eveniment', {
      uploaded: true,
      filename,
      declaredTitle: previewTitle,
      titleConfirmed: true,
      isPendingConfirm: false,
    });
  };

  const downloadDocx = async () => {
    const blob = await generateDocx(previewTitle, previewText, { images: eventReportPhotos });
    const filename = `Raport_eveniment_${date}.docx`;
    downloadBlob(blob, filename);
  };

  const isComplete = !missingEventMOM && !missingEventProof;

  const updateProofAtOtherExpert = (checked: boolean) => {
    onUpsertSlot('event_proof', 'Fotografii + link eveniment', {
      isCommonDeliverable: checked,
      uploadedByExpertId: checked ? commonEventProof?.uploadedByExpertId : undefined,
      uploadedByExpertName: checked ? commonEventProof?.uploadedByExpertName : undefined,
      ...(checked ? { uploaded: false } : {}),
    });
  };

  const updateProofExpert = (expertId: string) => {
    const selectedExpert = otherExperts.find((ex) => ex.id === expertId);
    onUpsertSlot('event_proof', 'Fotografii + link eveniment', {
      isCommonDeliverable: true,
      uploaded: false,
      uploadedByExpertId: selectedExpert?.id,
      uploadedByExpertName: selectedExpert?.name,
    });
  };

  // Cross-check date from MOM vs pontaj date
  const momDocText = eventMOM?.docText || '';
  const momExtractedDate = momDocText ? extractEventDate(momDocText) : null;
  const dateMismatch = momExtractedDate && date && momExtractedDate !== date;

  const formatDate = (d: string) => {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
      <div className="flex items-center gap-2 text-xs font-medium text-green-800 mb-3">
        <Mic className="h-4 w-4" />
        Documente participare eveniment
      </div>

      <div className="flex flex-col gap-3">
        {/* SLOT 1: MOM / Raport */}
        <div>
          <div className="text-[11px] font-medium text-green-800 mb-2">
            1. MOM sau Raport eveniment
          </div>

          {/* Toggle */}
          <RadioGroup
            value={hasMOM ? 'upload' : 'generate'}
            onValueChange={(v) => setHasMOM(v === 'upload')}
            className="mb-3 p-2 bg-white/60 rounded-md border border-green-200"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="upload" id="upload" />
              <Label htmlFor="upload" className="text-xs text-green-800 cursor-pointer">
                Am MOM sau Raport eveniment - il incarc direct
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="generate" id="generate" />
              <Label htmlFor="generate" className="text-xs text-green-800 cursor-pointer">
                Nu am MOM - descriu participarea si aplicatia genereaza raportul
              </Label>
            </div>
          </RadioGroup>

          {/* Upload direct */}
          {hasMOM && (
            <DeliverableItem
              deliverable={eventMOM || createDeliverableSlot('event_mom', 'Minute intalnire / MOM')}
              subActivity={subActivity}
              activityTitle={activityTitle}
              onUpdate={(patch) => onUpsertSlot('event_mom', 'MOM / Minut / Proces verbal eveniment', patch)}
              showSteps={false}
              required={true}
              label="MOM / Proces verbal / Raport de eveniment"
              hint="Document cu data, participanti, agenda, concluzii. MOM: semnaturi olografe obligatorii."
              canCheckEligibility={canCheckEligibility}
              eligibilityBlockedReason={eligibilityBlockedReason}
              notesMode={deliverableNotesMode}
            />
          )}

          {/* Generate with OpenAI */}
          {!hasMOM && (
            <div className="flex flex-col gap-2">
              {!confirmed && (
                <div className="bg-white/70 rounded-lg p-3 border border-green-200">
                  <div className="text-[11px] font-medium text-green-800 mb-1">
                    Descrie participarea la eveniment
                  </div>
                  <div className="text-[10px] text-green-600 mb-2">
                    Cine a participat, ce s-a discutat, ce s-a decis, ce actiuni urmeaza.
                  </div>
                  <Textarea
                    value={genDesc}
                    onChange={(e) => setGenDesc(e.target.value)}
                    rows={4}
                    placeholder="Ex: Am participat la atelierul de lucru organizat de CPC pe tema monitorizarii legislative regionale. Au fost prezenti 12 reprezentanti ai membrilor din regiunea Sud-Muntenia..."
                    className="text-xs mb-2"
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={generateReport}
                      disabled={genLoading || genDesc.trim().length < 20}
                      size="sm"
                      className="text-xs bg-green-600 hover:bg-green-700"
                    >
                      {genLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {genLoading ? 'Se genereaza...' : 'Genereaza raport'}
                    </Button>
                    {genDesc.trim().length < 20 && genDesc.length > 0 && (
                      <span className="text-[10px] text-slate-500">{genDesc.trim().length}/20 min.</span>
                    )}
                  </div>
                  {genErr && (
                    <div className="mt-2 text-[11px] text-red-700 bg-red-50 p-2 rounded">
                      {genErr}
                    </div>
                  )}
                  {genWarning && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded">
                      {genWarning}
                    </div>
                  )}
                </div>
              )}

              {/* Preview */}
              {preview && !confirmed && (
                <div className="bg-white rounded-lg p-3 border border-green-500">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-[11px] font-medium text-green-800">
                      Previzualizare - verifica si editeaza daca e necesar
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreview(null)}
                      className="text-[10px] h-6"
                    >
                      Regenereaza
                    </Button>
                  </div>
                  <div className="mb-2">
                    <Label className="text-[10px]">Titlu raport</Label>
                    <Input
                      value={previewTitle}
                      onChange={(e) => setPreviewTitle(e.target.value)}
                      className="text-xs font-medium"
                    />
                  </div>
                  <div className="mb-3">
                    <Label className="text-[10px]">Continut raport - editeaza direct</Label>
                    <Textarea
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      rows={12}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={confirmReport} size="sm" className="text-xs bg-green-600 hover:bg-green-700">
                      <Check className="h-3 w-3 mr-1" />
                      Confirm - descarca si marcheaza ca validat
                    </Button>
                    <Button onClick={downloadDocx} variant="outline" size="sm" className="text-xs border-green-400 text-green-700">
                      <Download className="h-3 w-3 mr-1" />
                      Descarca Word
                    </Button>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-2">
                    Dupa confirmare, raportul este marcat ca valid - nu mai trebuie reuploaded.
                  </div>
                </div>
              )}

              {/* Confirmed state */}
              {confirmed && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-green-100 border border-green-300">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-700" />
                    <div>
                      <div className="text-[11px] font-medium text-green-800">Raport de participare validat</div>
                      <div className="text-[10px] text-green-600">{eventMOM?.declaredTitle?.slice(0, 70)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {preview && (
                      <Button onClick={downloadDocx} variant="ghost" size="sm" className="text-[10px] h-6 text-green-700">
                        <Download className="h-3 w-3 mr-1" />
                        Word
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setConfirmed(false);
                        onUpsertSlot('event_mom', 'Raport de participare eveniment', {
                          uploaded: false,
                          isPendingConfirm: false,
                        });
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 text-green-700"
                    >
                      Modifica
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SLOT 2: Dovada participare */}
        <div>
          <div className="text-[11px] font-medium text-green-800 mb-1">
            2. Dovada participare {proofRequired ? '- obligatorie' : '- optionala'}
          </div>
          <div className="text-[10px] text-green-600 mb-2">
            {proofRequired
              ? 'Incarca poza/lista de prezenta sau indica expertul care a incarcat dovada comuna.'
              : 'Optional: MOM-ul semnat contine deja lista participantilor, deci dovada separata nu blocheaza salvarea.'}
          </div>

          {!hasMOM && (
            <div className="mb-2 rounded-md border border-amber-200 bg-white/70 p-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="eventProofAtOtherExpert"
                  checked={proofAtOtherExpert}
                  onCheckedChange={(checked) => updateProofAtOtherExpert(checked === true)}
                />
                <Label htmlFor="eventProofAtOtherExpert" className="text-xs text-green-800 cursor-pointer">
                  Dovada participarii este incarcata la alt expert
                </Label>
              </div>

              {proofAtOtherExpert && (
                <div className="mt-2">
                  <Label className="text-[10px] text-amber-700">Expertul care detine dovada</Label>
                  <Select
                    value={commonEventProof?.uploadedByExpertId || ''}
                    onValueChange={updateProofExpert}
                  >
                    <SelectTrigger className="mt-1 h-8 w-full bg-white text-xs">
                      <SelectValue placeholder="Alege expertul" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherExperts.map((expertOption) => (
                        <SelectItem key={expertOption.id} value={expertOption.id}>
                          {expertOption.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {otherExperts.length === 0 && (
                    <div className="mt-1 text-[10px] text-amber-700">
                      Nu exista alti experti disponibili pentru selectie.
                    </div>
                  )}
                  {!proofAtOtherExpertValid && (
                    <div className="mt-1 text-[10px] text-amber-700">
                      Selecteaza expertul concret pentru ca dovada sa fie considerata valida.
                    </div>
                  )}
                  {proofAtOtherExpertValid && (
                    <div className="mt-1 text-[10px] text-green-700">
                      Dovada va fi preluata de la {commonEventProof?.uploadedByExpertName || selectedProofExpert?.name}.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!proofAtOtherExpert && (
            <div className="space-y-2">
              {(localEventProofs.length > 0 ? localEventProofs : [createDeliverableSlot('event_proof', 'Fotografii eveniment')]).map((proof, index) => (
                <DeliverableItem
                  key={proof.id}
                  deliverable={proof}
                  subActivity={subActivity}
                  activityTitle={activityTitle}
                  onUpdate={(patch) => (
                    localEventProofs.length > 0
                      ? onUpdateDeliverable(proof.id, patch)
                      : onUpsertSlot('event_proof', 'Fotografii + link eveniment', patch)
                  )}
                  onRemove={localEventProofs.length > 1 ? () => onRemoveDeliverable(proof.id) : undefined}
                  showSteps={false}
                  required={proofRequired && index === 0}
                  label={index === 0 ? 'Fotografie eveniment SAU Lista prezenta cu semnaturi olografe' : `Fotografie eveniment ${index + 1}`}
                  hint="JPG/PNG sau document scanat cu semnaturile participantilor."
                  canCheckEligibility={canCheckEligibility}
                  eligibilityBlockedReason={eligibilityBlockedReason}
                  notesMode={deliverableNotesMode}
                />
              ))}
              <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-green-300 bg-white/70 px-3 py-2">
                <div className="text-[10px] text-green-700">
                  Fotografiile incarcate aici vor fi inserate automat in raportul Word generat.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddEventProof}
                  className="h-8 shrink-0 border-green-300 text-xs text-green-700"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Adauga fotografie
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date mismatch warning */}
      {dateMismatch && (
        <div className="mt-2 p-2 rounded-lg bg-amber-100 border border-amber-300 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-amber-800">Data eveniment != data pontata</div>
            <div className="text-[11px] text-amber-700 mt-0.5">
              MOM-ul indica data {formatDate(momExtractedDate!)}, dar ai pontat pentru {formatDate(date)}. Verificati daca activitatea a fost declarata in ziua corecta.
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className={`mt-2 text-[11px] p-2 rounded ${
        isComplete ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}>
        {isComplete 
          ? 'OK: Documentele de eveniment sunt complete'
          : `Atentie: Lipsesc: ${[missingEventMOM ? 'MOM/Raport eveniment' : null, missingEventProof ? 'Dovada participare' : null].filter(Boolean).join(' si ')}`
        }
      </div>
    </div>
  );
}

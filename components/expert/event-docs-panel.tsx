'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Mic, Loader2, Download, Check, AlertTriangle, X } from 'lucide-react';
import { DeliverableItem } from './deliverable-item';
import { type DeliverableSlot, extractEventDate, createDeliverableSlot } from '@/lib/deliverable-types';
import { generateDocx, downloadBlob } from '@/lib/document-utils';

interface EventDocsPanelProps {
  deliverables: DeliverableSlot[];
  subActivity: string;
  activityTitle: string;
  date: string;
  description: string;
  apiKey: string | null;
  onUpdateDeliverable: (id: string, patch: Partial<DeliverableSlot>) => void;
  onUpsertSlot: (slotType: 'event_mom' | 'event_proof', name: string, patch: Partial<DeliverableSlot>) => void;
}

export function EventDocsPanel({
  deliverables,
  subActivity,
  activityTitle,
  date,
  description,
  apiKey,
  onUpdateDeliverable,
  onUpsertSlot,
}: EventDocsPanelProps) {
  const [hasMOM, setHasMOM] = useState(true);
  const [genDesc, setGenDesc] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; ds: string } | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  // Find event docs
  const eventMOM = deliverables.find(d => d.slotType === 'event_mom');
  const eventProof = deliverables.find(d => d.slotType === 'event_proof');

  const missingEventMOM = !eventMOM?.uploaded && !confirmed;
  const missingEventProof = !eventProof?.uploaded;

  const generateReport = async () => {
    if (!apiKey) {
      setGenErr('API key nedefinit - apasa butonul Setari din header');
      return;
    }
    if (genDesc.trim().length < 20) {
      setGenErr('Descrierea trebuie sa aiba minim 20 caractere');
      return;
    }

    setGenLoading(true);
    setGenErr(null);

    try {
      const response = await fetch('/api/ai/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          subActivity,
          activityTitle,
          date,
          description: genDesc,
          hasPhoto: eventProof?.uploaded || false,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate report');
      const { title, content } = await response.json();

      setPreviewTitle(title);
      setPreviewText(content);
      setPreview({ title, ds: date });
      setConfirmed(false);

      // Mark as pending
      onUpsertSlot('event_mom', 'Raport de participare eveniment', {
        uploaded: false,
        filename: '',
        declaredTitle: title,
        isPendingConfirm: true,
      });
    } catch (err) {
      setGenErr('Eroare generare: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setGenLoading(false);
    }
  };

  const confirmReport = async () => {
    // Generate and download DOCX
    const blob = await generateDocx(previewTitle, previewText);
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
    const blob = await generateDocx(previewTitle, previewText);
    const filename = `Raport_eveniment_${date}.docx`;
    downloadBlob(blob, filename);
  };

  const isComplete = !missingEventMOM && !missingEventProof;

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
        {/* SLOT 1: Dovada participare (always visible, required) */}
        <div>
          <div className="text-[11px] font-medium text-green-800 mb-1">
            1. Dovada participare - obligatorie
          </div>
          <div className="text-[10px] text-green-600 mb-2">
            Incarca intai poza sau lista de prezenta - va fi inclusa in raportul generat.
          </div>
          <DeliverableItem
            deliverable={eventProof || createDeliverableSlot('event_proof', 'Fotografii eveniment')}
            apiKey={null}
            subActivity={subActivity}
            activityTitle={activityTitle}
            onUpdate={(patch) => onUpsertSlot('event_proof', 'Fotografii + link eveniment', patch)}
            showSteps={false}
            required={true}
            label="Fotografie eveniment SAU Lista prezenta cu semnaturi olografe"
            hint="JPG/PNG sau document scanat cu semnaturile participantilor."
          />
        </div>

        {/* SLOT 2: MOM / Raport */}
        <div>
          <div className="text-[11px] font-medium text-green-800 mb-2">
            2. MOM sau Raport eveniment
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
              apiKey={apiKey}
              subActivity={subActivity}
              activityTitle={activityTitle}
              onUpdate={(patch) => onUpsertSlot('event_mom', 'MOM / Minut / Proces verbal eveniment', patch)}
              showSteps={false}
              required={true}
              label="MOM / Proces verbal / Raport de eveniment"
              hint="Document cu data, participanti, agenda, concluzii. MOM: semnaturi olografe obligatorii."
            />
          )}

          {/* Generate with Claude */}
          {!hasMOM && (
            <div className="flex flex-col gap-2">
              {!confirmed && (
                <div className="bg-white/70 rounded-lg p-3 border border-green-200">
                  <div className="text-[11px] font-medium text-green-800 mb-1">
                    Descrie participarea la eveniment
                  </div>
                  <div className="text-[10px] text-green-600 mb-2">
                    Cine a participat, ce s-a discutat, ce s-a decis, ce actiuni urmeaza. Poza de mai sus va fi inclusa in raport.
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
                    {!apiKey && (
                      <span className="text-[10px] text-amber-700">API key nedefinit - apasa ⚙</span>
                    )}
                  </div>
                  {genErr && (
                    <div className="mt-2 text-[11px] text-red-700 bg-red-50 p-2 rounded">
                      {genErr}
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
          ? '✓ Documentele de eveniment sunt complete'
          : `⚠ Lipsesc: ${[missingEventMOM ? 'MOM/Raport eveniment' : null, missingEventProof ? 'Dovada participare' : null].filter(Boolean).join(' si ')}`
        }
      </div>
    </div>
  );
}

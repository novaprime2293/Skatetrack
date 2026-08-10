import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, Label, TextInput, TextArea } from '../components/ui';
import { todayISO } from '../data/storage';

export function SettingsPage() {
  const navigate = useNavigate();
  const teacher = useStore((s) => s.db.teacher);
  const updateTeacherName = useStore((s) => s.updateTeacherName);
  const updateMonthlyTarget = useStore((s) => s.updateMonthlyTarget);
  const exportJSON = useStore((s) => s.exportJSON);
  const importJSON = useStore((s) => s.importJSON);
  const resetAll = useStore((s) => s.resetAll);

  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [name, setName] = useState(teacher.name);
  const [monthlyTarget, setMonthlyTarget] = useState<string>(String(teacher.monthlyTarget));

  // Keep local input in sync if the underlying value changes externally (e.g. after import).
  useEffect(() => {
    setMonthlyTarget(String(teacher.monthlyTarget));
  }, [teacher.monthlyTarget]);
  useEffect(() => {
    setName(teacher.name);
  }, [teacher.name]);

  const handleExport = () => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skatetrack-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    setImportError(null);
    const result = await importJSON(importText);
    if (result.ok) {
      setImportSuccess(true);
      setTimeout(() => {
        setShowImport(false);
        setImportSuccess(false);
        setImportText('');
      }, 1500);
    } else {
      setImportError(result.error ?? 'Unknown error');
    }
  };

  const handleReset = () => {
    if (confirm('⚠️ This will delete ALL your data permanently. Are you sure?')) {
      if (confirm('Really? This cannot be undone. Export first if you want a backup.')) {
        void resetAll();
        navigate('/');
      }
    }
  };

  return (
    <div className="px-4 pb-12">
      <PageHeader title="Settings" />

      <Card className="mb-4">
        <Label>Your name</Label>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          size="sm"
          className="mt-2"
          onClick={() => updateTeacherName(name.trim() || 'Coach')}
          disabled={name.trim() === teacher.name}
        >
          Save
        </Button>
      </Card>

      <Card className="mb-4 border-neon-cyan/40">
        <div className="text-xs uppercase tracking-wider text-neon-cyan font-bold mb-1">Attendance goal</div>
        <Label>Monthly minimum classes</Label>
        <p className="text-xs text-fg-secondary mb-3">
          How many classes a student should aim for each month. Charts will show how far each student is from this number. Exceeding it is fine.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={monthlyTarget}
            onChange={(e) => setMonthlyTarget(e.target.value)}
            className="w-24 bg-bg-base border border-border rounded-xl px-4 py-3 text-fg-primary focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/50"
            aria-label="Monthly minimum classes"
          />
          <span className="text-xs text-fg-muted">classes / month</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => {
            const n = parseInt(monthlyTarget, 10);
            if (Number.isFinite(n)) updateMonthlyTarget(n);
          }}
          disabled={
            !monthlyTarget.trim() ||
            (Number.isFinite(parseInt(monthlyTarget, 10)) &&
              parseInt(monthlyTarget, 10) === teacher.monthlyTarget)
          }
        >
          Save
        </Button>
      </Card>

      <Card className="mb-4 border-neon-green/40">
        <div className="text-xs uppercase tracking-wider text-neon-green font-bold mb-1">Backup</div>
        <h3 className="text-lg font-bold mb-1">Export your data</h3>
        <p className="text-sm text-fg-secondary mb-3">
          Download a JSON file of all your batches, students, and attendance. Save it somewhere safe (email it to yourself, Dropbox, etc.).
        </p>
        <Button onClick={handleExport} className="w-full">📥 Download backup</Button>
      </Card>

      <Card className="mb-4 border-neon-cyan/40">
        <div className="text-xs uppercase tracking-wider text-neon-cyan font-bold mb-1">Restore</div>
        <h3 className="text-lg font-bold mb-1">Import a backup</h3>
        <p className="text-sm text-fg-secondary mb-3">
          Paste a backup JSON to restore. Replaces everything currently in the app.
        </p>
        <Button variant="secondary" onClick={() => setShowImport(true)} className="w-full">📤 Import backup</Button>
      </Card>

      <Card className="border-neon-pink/40">
        <div className="text-xs uppercase tracking-wider text-neon-pink font-bold mb-1">Danger zone</div>
        <h3 className="text-lg font-bold mb-1">Reset all data</h3>
        <p className="text-sm text-fg-secondary mb-3">Permanently delete everything. Cannot be undone.</p>
        <Button variant="danger" onClick={handleReset} className="w-full">🗑️ Reset everything</Button>
      </Card>

      <Card className="mt-4 !p-3">
        <div className="text-xs text-fg-muted text-center">
          Skatetrack v0.1.0 · Data is stored on your phone
        </div>
      </Card>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import backup">
        <div className="space-y-3">
          <Label>Paste backup JSON</Label>
          <TextArea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            placeholder='Paste your {"schemaVersion": ...} here'
          />
          {importError && <div className="text-sm text-neon-pink">{importError}</div>}
          {importSuccess && <div className="text-sm text-neon-green">✓ Restored!</div>}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowImport(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleImport} disabled={!importText.trim() || importSuccess} className="flex-1">Restore</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

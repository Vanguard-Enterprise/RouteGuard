"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface ImportWizardProps {
  orgId: string;
  schools: { id: string; name: string }[];
}

type StudentField =
  | "firstName"
  | "lastName"
  | "studentNumber"
  | "grade"
  | "schoolId"
  | "rfidTagId"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "medicalNotes"
  | "status"
  | "__skip__";

const FIELD_OPTIONS: { value: StudentField; label: string }[] = [
  { value: "__skip__", label: "-- Skip --" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "studentNumber", label: "Student Number" },
  { value: "grade", label: "Grade" },
  { value: "schoolId", label: "School Name" },
  { value: "rfidTagId", label: "RFID Tag" },
  { value: "address", label: "Address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "ZIP Code" },
  { value: "medicalNotes", label: "Medical Notes" },
  { value: "status", label: "Status" },
];

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          cells.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function guessMapping(header: string): StudentField {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  if (h.includes("first") && h.includes("name")) return "firstName";
  if (h.includes("last") && h.includes("name")) return "lastName";
  if (h === "firstname" || h === "first") return "firstName";
  if (h === "lastname" || h === "last") return "lastName";
  if (h.includes("student") && h.includes("num")) return "studentNumber";
  if (h === "studentid" || h === "studentnumber") return "studentNumber";
  if (h === "grade") return "grade";
  if (h === "school" || h === "schoolname") return "schoolId";
  if (h.includes("rfid") || h.includes("tag")) return "rfidTagId";
  if (h === "address" || h === "streetaddress") return "address";
  if (h === "city") return "city";
  if (h === "state") return "state";
  if (h === "zip" || h === "zipcode" || h === "postalcode") return "zip";
  if (h.includes("medical") || h.includes("notes")) return "medicalNotes";
  if (h === "status") return "status";
  return "__skip__";
}

interface RowError {
  row: number;
  field: string;
  message: string;
}

export function ImportWizard({ orgId, schools }: ImportWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<StudentField[]>([]);
  const [validationErrors, setValidationErrors] = useState<RowError[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // Step 1: File upload
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);

        if (parsed.length < 2) {
          return;
        }

        const csvHeaders = parsed[0];
        const csvRows = parsed.slice(1);

        setHeaders(csvHeaders);
        setRows(csvRows);
        setMapping(csvHeaders.map(guessMapping));
        setStep(2);
      };
      reader.readAsText(file);
    },
    []
  );

  // Step 2 -> 3: Validate
  function validateData() {
    const errors: RowError[] = [];
    const schoolNameMap: Record<string, string> = {};
    for (const s of schools) {
      schoolNameMap[s.name.toLowerCase()] = s.id;
    }

    const firstNameIdx = mapping.indexOf("firstName");
    const lastNameIdx = mapping.indexOf("lastName");

    if (firstNameIdx === -1) {
      errors.push({ row: 0, field: "firstName", message: "First Name column is not mapped" });
    }
    if (lastNameIdx === -1) {
      errors.push({ row: 0, field: "lastName", message: "Last Name column is not mapped" });
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (firstNameIdx >= 0 && !row[firstNameIdx]?.trim()) {
        errors.push({ row: i + 1, field: "firstName", message: "First name is empty" });
      }
      if (lastNameIdx >= 0 && !row[lastNameIdx]?.trim()) {
        errors.push({ row: i + 1, field: "lastName", message: "Last name is empty" });
      }

      const schoolIdx = mapping.indexOf("schoolId");
      if (schoolIdx >= 0 && row[schoolIdx]?.trim()) {
        const schoolName = row[schoolIdx].trim().toLowerCase();
        if (!schoolNameMap[schoolName]) {
          errors.push({
            row: i + 1,
            field: "schoolId",
            message: `School "${row[schoolIdx].trim()}" not found`,
          });
        }
      }

      const statusIdx = mapping.indexOf("status");
      if (statusIdx >= 0 && row[statusIdx]?.trim()) {
        const val = row[statusIdx].trim().toLowerCase();
        if (!["active", "inactive", "graduated"].includes(val)) {
          errors.push({
            row: i + 1,
            field: "status",
            message: `Invalid status "${row[statusIdx].trim()}"`,
          });
        }
      }
    }

    setValidationErrors(errors);
    setStep(3);
  }

  // Step 3 -> 4: Import
  async function performImport() {
    setImporting(true);

    const schoolNameMap: Record<string, string> = {};
    for (const s of schools) {
      schoolNameMap[s.name.toLowerCase()] = s.id;
    }

    const studentRecords = rows.map((row) => {
      const record: Record<string, string> = {};
      mapping.forEach((field, idx) => {
        if (field === "__skip__") return;
        const value = row[idx]?.trim() ?? "";
        if (field === "schoolId") {
          record[field] = schoolNameMap[value.toLowerCase()] ?? "";
        } else if (field === "status") {
          const lower = value.toLowerCase();
          record[field] = ["active", "inactive", "graduated"].includes(lower)
            ? lower
            : "active";
        } else {
          record[field] = value;
        }
      });
      return record;
    });

    try {
      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: studentRecords }),
      });

      const result = await res.json();

      if (!res.ok) {
        setImportResult({
          imported: 0,
          errors: [{ row: 0, message: result.error || "Import failed" }],
        });
      } else {
        setImportResult(result);
      }
    } catch {
      setImportResult({
        imported: 0,
        errors: [{ row: 0, message: "Network error during import" }],
      });
    } finally {
      setImporting(false);
      setStep(4);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step >= s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </div>
            <span
              className={`text-sm ${
                step >= s
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }`}
            >
              {s === 1 && "Upload"}
              {s === 2 && "Map Columns"}
              {s === 3 && "Preview"}
              {s === 4 && "Import"}
            </span>
            {s < 4 && (
              <div className="mx-2 h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
            <CardDescription>
              Select a CSV file containing student records to import.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label
              htmlFor="csv-upload"
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 cursor-pointer hover:border-muted-foreground/50 transition-colors"
            >
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                CSV files only (.csv)
              </p>
              {fileName && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </div>
              )}
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Match each CSV column to a student field. We auto-detected some
              mappings for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Column</TableHead>
                    <TableHead>Sample Data</TableHead>
                    <TableHead>Maps To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {rows
                          .slice(0, 3)
                          .map((r) => r[idx])
                          .filter(Boolean)
                          .join(", ")
                          .slice(0, 60) || "--"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[idx]}
                          onValueChange={(val) => {
                            const next = [...mapping];
                            next[idx] = val as StudentField;
                            setMapping(next);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={validateData}>Next: Preview</Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 3: Validation Preview */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview &amp; Validate</CardTitle>
            <CardDescription>
              Showing first 5 rows. {rows.length} total rows will be imported.
              {validationErrors.length > 0 && (
                <span className="text-destructive ml-2">
                  {validationErrors.length} error(s) found.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationErrors.length > 0 && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 space-y-1">
                {validationErrors.slice(0, 10).map((err, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm text-destructive"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {err.row === 0
                        ? err.message
                        : `Row ${err.row}: ${err.message}`}
                    </span>
                  </div>
                ))}
                {validationErrors.length > 10 && (
                  <p className="text-sm text-destructive ml-6">
                    ...and {validationErrors.length - 10} more errors
                  </p>
                )}
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {mapping.map(
                      (field, idx) =>
                        field !== "__skip__" && (
                          <TableHead key={idx}>
                            {FIELD_OPTIONS.find((o) => o.value === field)
                              ?.label ?? field}
                          </TableHead>
                        )
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      <TableCell className="text-muted-foreground">
                        {rowIdx + 1}
                      </TableCell>
                      {mapping.map(
                        (field, colIdx) =>
                          field !== "__skip__" && (
                            <TableCell key={colIdx}>
                              {row[colIdx] || (
                                <span className="text-muted-foreground">
                                  --
                                </span>
                              )}
                            </TableCell>
                          )
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              onClick={performImport}
              disabled={
                importing ||
                validationErrors.some((e) => e.row === 0)
              }
            >
              {importing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Import {rows.length} Students
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 4 && importResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              {importResult.errors.length === 0 ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Import Complete
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Import Completed with Errors
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Successfully imported{" "}
              <span className="font-semibold">{importResult.imported}</span>{" "}
              student(s).
            </p>
            {importResult.errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                {importResult.errors.map((err, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-sm text-destructive"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {err.row > 0
                        ? `Row ${err.row}: ${err.message}`
                        : err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/dashboard/students")}>
              Go to Students
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

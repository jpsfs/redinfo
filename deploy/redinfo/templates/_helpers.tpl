{{- /* Common name helpers for the redinfo chart */ -}}
{{- define "redinfo.name" -}}
{{- default .Chart.Name .Values.nameOverride -}}
{{- end -}}

{{- define "redinfo.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride }}
{{- else }}
{{- $name := include "redinfo.name" . }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end -}}

{{- /* Name of the bundled postgresql subchart's primary service (matches the bitnami chart's own naming) */ -}}
{{- define "redinfo.postgresqlFullname" -}}
{{- printf "%s-postgresql" (include "redinfo.fullname" .) -}}
{{- end -}}

{{- /*
  DATABASE_URL for the backend. Uses .Values.database.url verbatim when set (external DB);
  otherwise composes it from the bundled postgresql subchart's own values so the two never drift.
  Username/password are URL-escaped since bitnami passwords may contain characters like @ or /.
*/ -}}
{{- define "redinfo.databaseUrl" -}}
{{- if .Values.database.url -}}
{{- .Values.database.url -}}
{{- else -}}
{{- $user := .Values.postgresql.auth.username | default "postgres" -}}
{{- $pass := .Values.postgresql.auth.password | default "" -}}
{{- $db := .Values.postgresql.auth.database | default "redinfo" -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" (urlquery $user) (urlquery $pass) (include "redinfo.postgresqlFullname" .) $db -}}
{{- end -}}
{{- end -}}

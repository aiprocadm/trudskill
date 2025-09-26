{{- define "cdoprof.name" -}}
cdoprof
{{- end -}}

{{- define "cdoprof.fullname" -}}
{{ include "cdoprof.name" . }}
{{- end -}}

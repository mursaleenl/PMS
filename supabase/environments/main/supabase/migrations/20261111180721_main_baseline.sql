SET local check_function_bodies = off;

CREATE TABLE "public"."attendance_audit" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"   uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "old_record" jsonb,
  "new_record" jsonb,
  CONSTRAINT "attendance_audit_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."attendance_audit"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."attendance_audit" FROM "anon";

CREATE TABLE "public"."attendance_challenges" (
  "token"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "expires_at" timestamp with time zone NOT NULL DEFAULT (clock_timestamp() + '00:01:00'::interval),
  CONSTRAINT "attendance_challenges_pkey" PRIMARY KEY (token)
);

ALTER TABLE "public"."attendance_challenges"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."attendance_challenges" FROM "anon", "authenticated";

CREATE TABLE "public"."attendance_records" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "work_date"    date                     NOT NULL DEFAULT CURRENT_DATE,
  "status"       text                     NOT NULL,
  "hours_logged" numeric(5,2)             NOT NULL DEFAULT 0,
  "notes"        text,
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "source"       text                     NOT NULL DEFAULT 'manual'::text,
  CONSTRAINT "attendance_records_hours_logged_check" CHECK (((hours_logged >= (0)::numeric) AND (hours_logged <= (24)::numeric))),
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY (id),
  CONSTRAINT "attendance_records_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'qr'::text]))),
  CONSTRAINT "attendance_records_status_check" CHECK ((status = ANY (ARRAY['PRESENT'::text, 'REMOTE'::text, 'HALF_DAY'::text, 'ON_LEAVE'::text, 'ABSENT'::text]))),
  CONSTRAINT "attendance_records_user_id_work_date_key" UNIQUE (user_id, work_date)
);

ALTER TABLE "public"."attendance_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."attendance_sessions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "work_date"      date                     NOT NULL,
  "checked_in_at"  timestamp with time zone NOT NULL,
  "checked_out_at" timestamp with time zone,
  "checkin_token"  uuid                     NOT NULL,
  "checkout_token" uuid,
  CONSTRAINT "attendance_sessions_check" CHECK (((checked_out_at IS NULL) OR (checked_out_at >= checked_in_at))),
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "attendance_sessions_user_id_checkin_token_key" UNIQUE (user_id, checkin_token),
  CONSTRAINT "attendance_sessions_user_id_checkout_token_key" UNIQUE (user_id, checkout_token)
);

ALTER TABLE "public"."attendance_sessions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."attendance_sessions" FROM "anon";

CREATE TABLE "public"."attendance_settings" (
  "id"          boolean NOT NULL DEFAULT true,
  "office_name" text    NOT NULL DEFAULT 'Main office'::text,
  "timezone"    text    NOT NULL DEFAULT 'Asia/Kolkata'::text,
  CONSTRAINT "attendance_settings_id_check" CHECK (id),
  CONSTRAINT "attendance_settings_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."attendance_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."audit_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid,
  "entity_type"   text                     NOT NULL,
  "entity_id"     uuid,
  "action"        text                     NOT NULL,
  "metadata"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."audit_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clients" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "company_name"   text                     NOT NULL,
  "contact_name"   text,
  "email"          text,
  "phone"          text,
  "website"        text,
  "country"        text,
  "timezone"       text,
  "client_user_id" uuid,
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clients_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."clients"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."general_tasks" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "external_id" text                     NOT NULL,
  "task"        jsonb                    NOT NULL,
  "revision"    bigint                   NOT NULL DEFAULT 0,
  "created_by"  uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "general_tasks_external_id_key" UNIQUE (external_id),
  CONSTRAINT "general_tasks_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."general_tasks"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."general_tasks" FROM "anon";

CREATE TABLE "public"."invoice_payment_references" (
  "invoice_id"   uuid                     NOT NULL,
  "reference"    text                     NOT NULL,
  "submitted_by" uuid                     NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_payment_references_pkey" PRIMARY KEY (invoice_id),
  CONSTRAINT "invoice_payment_references_reference_check" CHECK ((length(TRIM(BOTH FROM reference)) <= 200))
);

ALTER TABLE "public"."invoice_payment_references"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."invoices" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "invoice_number"        text                     NOT NULL,
  "lead_id"               uuid,
  "project_id"            uuid,
  "client_id"             uuid,
  "operating_company"     text,
  "bill_to"               text,
  "description"           text,
  "quantity"              numeric(10,2)            NOT NULL DEFAULT 1,
  "unit_price"            numeric(14,2)            NOT NULL DEFAULT 0,
  "subtotal"              numeric(14,2)            NOT NULL DEFAULT 0,
  "gst_enabled"           boolean                  NOT NULL DEFAULT false,
  "gst_rate"              numeric(5,2)             NOT NULL DEFAULT 0,
  "gst_amount"            numeric(14,2)            NOT NULL DEFAULT 0,
  "total"                 numeric(14,2)            NOT NULL DEFAULT 0,
  "issue_date"            date                     NOT NULL DEFAULT CURRENT_DATE,
  "due_date"              date,
  "contract_value"        numeric(14,2)            NOT NULL DEFAULT 0,
  "deposit_percent"       numeric(5,2)             NOT NULL DEFAULT 0,
  "deposit_amount"        numeric(14,2)            NOT NULL DEFAULT 0,
  "currency"              text                     NOT NULL DEFAULT 'USD'::text,
  "payment_terms"         text,
  "payment_instructions"  text,
  "external_payment_link" text,
  "status"                text                     NOT NULL DEFAULT 'GENERATED'::text,
  "sent_at"               timestamp with time zone,
  "transaction_reference" text,
  "confirmed_paid_at"     timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "revision"              bigint                   NOT NULL DEFAULT 0,
  "client_name"           text,
  "client_email"          text,
  "is_deposit"            boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "invoices_deposit_percent_check" CHECK (((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))),
  CONSTRAINT "invoices_invoice_number_key" UNIQUE (invoice_number),
  CONSTRAINT "invoices_operating_company_check" CHECK ((operating_company = ANY (ARRAY['Evecture'::text, 'Servn'::text]))),
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "invoices_status_check" CHECK ((status = ANY (ARRAY['GENERATED'::text, 'SENT'::text, 'CONFIRMED_PAID'::text])))
);

ALTER TABLE "public"."invoices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."leads" (
  "id"                           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "external_id"                  text,
  "client_id"                    uuid,
  "created_by"                   uuid,
  "full_name"                    text                     NOT NULL,
  "designation"                  text,
  "company_name"                 text,
  "company_website"              text,
  "email"                        text                     NOT NULL,
  "phone"                        text,
  "country"                      text,
  "timezone"                     text,
  "services"                     text[]                   NOT NULL DEFAULT '{}'::text[],
  "industry"                     text,
  "description"                  text,
  "reference_links"              text,
  "budget_range"                 text,
  "budget_shared"                boolean                  NOT NULL DEFAULT false,
  "budget_note"                  text,
  "urgency"                      text                     NOT NULL DEFAULT 'Standard'::text,
  "source"                       text,
  "acquisition_source"           text,
  "operating_company"            text,
  "status"                       text                     NOT NULL DEFAULT 'NEW'::text,
  "first_contact_at"             timestamp with time zone,
  "disqualification_reason"      text,
  "qualification"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "accepted_at"                  timestamp with time zone,
  "acceptance_name"              text,
  "created_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "qualification_note"           text,
  "acceptance_document_name"     text,
  "acceptance_document_data_url" text,
  "revision"                     bigint                   NOT NULL DEFAULT 0,
  "project_name"                 text,
  CONSTRAINT "leads_external_id_key" UNIQUE (external_id),
  CONSTRAINT "leads_operating_company_check" CHECK ((operating_company = ANY (ARRAY['Evecture'::text, 'Servn'::text]))),
  CONSTRAINT "leads_pkey" PRIMARY KEY (id),
  CONSTRAINT "leads_status_check" CHECK ((status = ANY (ARRAY['NEW'::text, 'PROPOSAL_SENT'::text, 'ACCEPTED'::text, 'CONVERTED'::text, 'LOST'::text]))),
  CONSTRAINT "leads_urgency_check" CHECK ((urgency = ANY (ARRAY['Standard'::text, 'Rush'::text])))
);

ALTER TABLE "public"."leads"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."managed_projects" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "external_id"       text,
  "source_project_id" uuid,
  "project_title"     text                     NOT NULL,
  "client_id"         uuid,
  "client_company"    text,
  "model"             text                     NOT NULL,
  "management_amount" numeric(14,2)            NOT NULL DEFAULT 0,
  "currency"          text                     NOT NULL DEFAULT 'USD'::text,
  "billing_cycle"     text                     NOT NULL,
  "period_start"      date                     NOT NULL,
  "period_end"        date,
  "status"            text                     NOT NULL DEFAULT 'ACTIVE'::text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "revision"          bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "managed_projects_billing_cycle_check" CHECK ((billing_cycle = ANY (ARRAY['Monthly'::text, 'Quarterly'::text, 'Annual'::text, 'One-time'::text]))),
  CONSTRAINT "managed_projects_external_id_key" UNIQUE (external_id),
  CONSTRAINT "managed_projects_model_check"
    CHECK ((model = ANY (ARRAY['Annual maintenance'::text, 'Continuous retainer'::text, 'Direct-sold software'::text, 'Ad-hoc support'::text]))),
  CONSTRAINT "managed_projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "managed_projects_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PAUSED'::text, 'ENDED'::text])))
);

ALTER TABLE "public"."managed_projects"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "email"      text                     NOT NULL,
  "full_name"  text,
  "avatar_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."project_clients" (
  "project_id" uuid NOT NULL,
  "client_id"  uuid NOT NULL,
  CONSTRAINT "project_clients_pkey" PRIMARY KEY (project_id, client_id)
);

ALTER TABLE "public"."project_clients"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."project_clients" FROM "anon";

CREATE TABLE "public"."project_links" (
  "id"         uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "link_type"  text NOT NULL,
  "url"        text NOT NULL,
  CONSTRAINT "project_links_link_type_check" CHECK ((link_type = ANY (ARRAY['staging'::text, 'repository'::text, 'design'::text, 'other'::text]))),
  CONSTRAINT "project_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "project_links_project_id_link_type_key" UNIQUE (project_id, link_type)
);

ALTER TABLE "public"."project_links"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."project_messages" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "project_id"  uuid                     NOT NULL,
  "sender_id"   uuid                     NOT NULL,
  "sender_name" text                     NOT NULL,
  "body"        text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_messages_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 5000))),
  CONSTRAINT "project_messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."project_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."project_team_members" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "project_id"         uuid                     NOT NULL,
  "user_id"            uuid,
  "role"               text                     NOT NULL,
  "name"               text,
  "allocation_percent" numeric(5,2)             NOT NULL DEFAULT 0,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_team_members_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."project_team_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."project_work_items" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "project_id"         uuid                     NOT NULL,
  "title"              text                     NOT NULL,
  "kind"               text                     NOT NULL,
  "assignee_user_id"   uuid,
  "assignee_name"      text,
  "priority"           text                     NOT NULL DEFAULT 'P3'::text,
  "estimated_hours"    numeric(8,2)             NOT NULL DEFAULT 0,
  "logged_hours"       numeric(8,2)             NOT NULL DEFAULT 0,
  "status"             text                     NOT NULL DEFAULT 'TO_DO'::text,
  "blocker_reason"     text,
  "proof"              jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "review_notes"       text,
  "revision_requested" boolean                  NOT NULL DEFAULT false,
  "timer_started_at"   timestamp with time zone,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "external_id"        text,
  "description"        text,
  "assignees"          jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "deadline"           timestamp with time zone,
  CONSTRAINT "project_work_items_assignees_check" CHECK (((jsonb_typeof(assignees) = 'array'::text) AND (jsonb_array_length(assignees) <= 100))),
  CONSTRAINT "project_work_items_description_check" CHECK (((description IS NULL) OR (char_length(description) <= 5000))),
  CONSTRAINT "project_work_items_kind_check" CHECK ((kind = ANY (ARRAY['FEATURE_DEV'::text, 'CLIENT_FEEDBACK_TODO'::text, 'QA_BUG'::text]))),
  CONSTRAINT "project_work_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "project_work_items_priority_check" CHECK ((priority = ANY (ARRAY['P1'::text, 'P2'::text, 'P3'::text, 'P4'::text]))),
  CONSTRAINT "project_work_items_status_check" CHECK ((status = ANY (ARRAY['TO_DO'::text, 'IN_PROGRESS'::text, 'BLOCKED'::text, 'UNDER_REVIEW'::text, 'DONE'::text])))
);

ALTER TABLE "public"."project_work_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."projects" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "external_id"              text,
  "lead_id"                  uuid,
  "client_id"                uuid,
  "proposal_id"              uuid,
  "title"                    text                     NOT NULL,
  "client_company"           text,
  "client_name"              text,
  "client_email"             text,
  "operating_company"        text,
  "services"                 text[]                   NOT NULL DEFAULT '{}'::text[],
  "classification"           text                     NOT NULL DEFAULT 'New Client'::text,
  "start_date"               date,
  "billing_structure"        text                     NOT NULL DEFAULT 'Fixed'::text,
  "contracted_value"         numeric(14,2)            NOT NULL DEFAULT 0,
  "currency"                 text                     NOT NULL DEFAULT 'USD'::text,
  "deposit_amount"           numeric(14,2),
  "deposit_status"           text,
  "scope_included"           text,
  "scope_excluded"           text,
  "assumptions"              text,
  "revision_rounds"          integer                  NOT NULL DEFAULT 0,
  "status"                   text                     NOT NULL DEFAULT 'ACTIVE'::text,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "signed_contract_name"     text,
  "signed_contract_data_url" text,
  "revision"                 bigint                   NOT NULL DEFAULT 0,
  "project_type"             text                     NOT NULL DEFAULT 'client'::text,
  "objectives"               text,
  "deliverables"             text,
  "target_date"              date,
  "priority"                 text                     NOT NULL DEFAULT 'Normal'::text,
  "logo_data_url"            text,
  "enquiry_details"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "additional_clients"       jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "internal_projects_no_sales"
    CHECK
    (((project_type <> 'internal'::text) OR ((lead_id IS NULL) AND (client_id IS NULL) AND (proposal_id IS NULL) AND (client_company IS NULL) AND (client_name IS NULL) AND
    (client_email IS NULL) AND (contracted_value = (0)::numeric) AND (deposit_amount IS NULL) AND (deposit_status IS NULL) AND (signed_contract_name IS NULL) AND
    (signed_contract_data_url IS NULL) AND (status <> 'AMC'::text)))),
  CONSTRAINT "projects_additional_clients_check"
    CHECK
    (((jsonb_typeof(additional_clients) = 'array'::text) AND (jsonb_array_length(additional_clients) <= 100) AND ((project_type <> 'internal'::text) OR (additional_clients =
    '[]'::jsonb)))),
  CONSTRAINT "projects_billing_structure_check" CHECK ((billing_structure = ANY (ARRAY['Fixed'::text, 'Hourly'::text, 'Retainer'::text]))),
  CONSTRAINT "projects_classification_check" CHECK ((classification = ANY (ARRAY['New Client'::text, 'Repeat Client'::text, 'Referral'::text]))),
  CONSTRAINT "projects_deposit_status_check" CHECK ((deposit_status = 'CONFIRMED_PAID'::text)),
  CONSTRAINT "projects_enquiry_details_check" CHECK ((jsonb_typeof(enquiry_details) = 'object'::text)),
  CONSTRAINT "projects_external_id_key" UNIQUE (external_id),
  CONSTRAINT "projects_logo_check"
    CHECK (((logo_data_url IS NULL) OR ((length(logo_data_url) <= 700000) AND (logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'::text)))),
  CONSTRAINT "projects_operating_company_check" CHECK ((operating_company = ANY (ARRAY['Evecture'::text, 'Servn'::text]))),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "projects_priority_check" CHECK ((priority = ANY (ARRAY['Low'::text, 'Normal'::text, 'High'::text, 'Urgent'::text]))),
  CONSTRAINT "projects_project_type_check" CHECK ((project_type = ANY (ARRAY['client'::text, 'internal'::text]))),
  CONSTRAINT "projects_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'ON_TRACK'::text, 'COMPLETED'::text, 'AMC'::text]))),
  CONSTRAINT "projects_target_date_check" CHECK (((target_date IS NULL) OR (start_date IS NULL) OR (target_date >= start_date)))
);

ALTER TABLE "public"."projects"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."proposal_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "proposal_id"   uuid                     NOT NULL,
  "event_type"    text                     NOT NULL,
  "actor_user_id" uuid,
  "note"          text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "proposal_events_event_type_check" CHECK ((event_type = ANY (ARRAY['SENT'::text, 'VIEWED'::text, 'ACCEPTED'::text, 'DECLINED'::text, 'CHANGES_REQUESTED'::text]))),
  CONSTRAINT "proposal_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."proposal_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."proposal_follow_ups" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "proposal_id" uuid                     NOT NULL,
  "label"       text                     NOT NULL,
  "due_at"      timestamp with time zone NOT NULL,
  "logged_at"   timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "proposal_follow_ups_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."proposal_follow_ups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."proposals" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "lead_id"                  uuid                     NOT NULL,
  "client_id"                uuid,
  "version"                  integer                  NOT NULL DEFAULT 1,
  "status"                   text                     NOT NULL DEFAULT 'DRAFT'::text,
  "share_token"              text,
  "proposal_title"           text                     NOT NULL,
  "project_title"            text,
  "prepared_by"              text,
  "executive_summary"        text,
  "background"               text,
  "challenge"                text,
  "approach"                 text,
  "objectives"               text,
  "scope_included"           text,
  "scope_excluded"           text,
  "deliverables"             text,
  "timeline"                 text,
  "quoted_amount"            numeric(14,2)            NOT NULL DEFAULT 0,
  "currency"                 text                     NOT NULL DEFAULT 'USD'::text,
  "billing_structure"        text                     NOT NULL DEFAULT 'Fixed'::text,
  "revision_rounds"          integer                  NOT NULL DEFAULT 0,
  "deposit_percent"          numeric(5,2)             NOT NULL DEFAULT 0,
  "payment_terms"            text,
  "payment_schedule"         text,
  "approval_process"         text,
  "client_requirements"      text,
  "assumptions"              text,
  "software_process_model"   text,
  "process_activities"       text,
  "budget_breakdown"         text,
  "system_architecture"      text,
  "risk_assessment"          text,
  "resources"                text,
  "technical_specifications" text,
  "timeline_deliverables"    text,
  "conclusion"               text,
  "about_us"                 text,
  "how_we_work"              text,
  "recent_work"              text,
  "testimonial"              text,
  "change_request_policy"    text,
  "intellectual_property"    text,
  "warranty_support"         text,
  "cancellation_policy"      text,
  "expiry_date"              date,
  "final_follow_up_date"     date,
  "sent_at"                  timestamp with time zone,
  "viewed_at"                timestamp with time zone,
  "responded_at"             timestamp with time zone,
  "response_name"            text,
  "response_note"            text,
  "attachment_path"          text,
  "created_by"               uuid,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "document_name"            text,
  "document_data_url"        text,
  CONSTRAINT "proposals_billing_structure_check" CHECK ((billing_structure = ANY (ARRAY['Fixed'::text, 'Hourly'::text, 'Retainer'::text]))),
  CONSTRAINT "proposals_deposit_percent_check" CHECK (((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))),
  CONSTRAINT "proposals_lead_id_version_key" UNIQUE (lead_id, VERSION),
  CONSTRAINT "proposals_pkey" PRIMARY KEY (id),
  CONSTRAINT "proposals_share_token_key" UNIQUE (share_token),
  CONSTRAINT "proposals_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SENT'::text, 'ACCEPTED'::text, 'DECLINED'::text, 'CHANGES_REQUESTED'::text, 'SUPERSEDED'::text])))
);

ALTER TABLE "public"."proposals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."qa_reports" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "kind"            text                     NOT NULL,
  "title"           text                     NOT NULL,
  "details"         text                     NOT NULL,
  "project_id"      uuid,
  "task_id"         uuid,
  "created_by"      uuid                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "general_task_id" uuid,
  "image_data_url"  text,
  "image_name"      text,
  "status"          text                     NOT NULL DEFAULT 'OPEN'::text,
  CONSTRAINT "qa_reports_details_check" CHECK (((length(TRIM(BOTH FROM details)) >= 1) AND (length(TRIM(BOTH FROM details)) <= 5000))),
  CONSTRAINT "qa_reports_general_task_id_key" UNIQUE (general_task_id),
  CONSTRAINT "qa_reports_kind_check" CHECK ((kind = ANY (ARRAY['BUG'::text, 'CHANGE'::text, 'IMPROVEMENT'::text]))),
  CONSTRAINT "qa_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "qa_reports_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'RESOLVED'::text]))),
  CONSTRAINT "qa_reports_task_id_key" UNIQUE (task_id),
  CONSTRAINT "qa_reports_title_check" CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 1000)))
);

ALTER TABLE "public"."qa_reports"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."qa_reports" FROM "anon";

CREATE TABLE "public"."workspace_members" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              uuid,
  "email"                text                     NOT NULL,
  "role"                 text                     NOT NULL,
  "display_name"         text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "must_change_password" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "workspace_members_email_key" UNIQUE (email),
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_members_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text, 'project_manager'::text, 'client'::text])))
);

ALTER TABLE "public"."workspace_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workspace_mutations" (
  "request_id"   uuid                     NOT NULL,
  "actor_id"     uuid                     NOT NULL,
  "payload_hash" text                     NOT NULL,
  "result"       jsonb                    NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_mutations_pkey" PRIMARY KEY (request_id)
);

ALTER TABLE "public"."workspace_mutations"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."workspace_mutations" FROM "anon", "authenticated";

CREATE TABLE "public"."workspace_notifications" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "recipient_id" uuid                     NOT NULL,
  "type"         text                     NOT NULL,
  "title"        text                     NOT NULL,
  "message"      text                     NOT NULL,
  "link"         text,
  "read"         boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_notifications_type_check" CHECK ((type = ANY (ARRAY['LEAD'::text, 'TASK'::text, 'PROJECT'::text])))
);

ALTER TABLE "public"."workspace_notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workspace_number_counters" (
  "counter_key" text   NOT NULL,
  "last_value"  bigint NOT NULL,
  CONSTRAINT "workspace_number_counters_pkey" PRIMARY KEY (counter_key)
);

ALTER TABLE "public"."workspace_number_counters"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."workspace_number_counters" FROM "anon", "authenticated";

CREATE TABLE "public"."workspace_records" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "collection" text                     NOT NULL,
  "record_id"  text                     NOT NULL,
  "sort_order" integer                  NOT NULL DEFAULT 0,
  "data"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_records_collection_check" CHECK ((collection = ANY (ARRAY['leads'::text, 'projects'::text, 'management'::text, 'postSaleOperations'::text]))),
  CONSTRAINT "workspace_records_collection_record_id_key" UNIQUE (collection, record_id),
  CONSTRAINT "workspace_records_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workspace_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workspace_reviews" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reporter_user_id" uuid                     NOT NULL,
  "reporter_name"    text                     NOT NULL,
  "reporter_email"   text,
  "title"            text                     NOT NULL,
  "report_type"      text                     NOT NULL,
  "priority"         text                     NOT NULL DEFAULT 'MEDIUM'::text,
  "description"      text                     NOT NULL,
  "page_path"        text,
  "status"           text                     NOT NULL DEFAULT 'OPEN'::text,
  "admin_note"       text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_reviews_description_check" CHECK (((char_length(TRIM(BOTH FROM description)) >= 8) AND (char_length(TRIM(BOTH FROM description)) <= 5000))),
  CONSTRAINT "workspace_reviews_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_reviews_priority_check" CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'URGENT'::text]))),
  CONSTRAINT "workspace_reviews_report_type_check" CHECK ((report_type = ANY (ARRAY['BUG'::text, 'ISSUE'::text]))),
  CONSTRAINT "workspace_reviews_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'RESOLVED'::text]))),
  CONSTRAINT "workspace_reviews_title_check" CHECK (((char_length(TRIM(BOTH FROM title)) >= 3) AND (char_length(TRIM(BOTH FROM title)) <= 180)))
);

ALTER TABLE "public"."workspace_reviews"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."workspace_reviews" FROM "anon";

CREATE OR REPLACE FUNCTION public.assign_qa_report (
  p_report_id           uuid,
  p_project_external_id text,
  p_assignee_id         uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare report public.qa_reports; project_uuid uuid; assigned_name text; task_uuid uuid; external_key text;
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into report from public.qa_reports where id=p_report_id for update;
  if not found then raise exception 'Report no longer exists'; end if;
  if not public.can_manage_workspace() and report.created_by<>auth.uid() then raise exception 'You can assign only your own reports' using errcode='42501'; end if;
  if report.task_id is not null or report.general_task_id is not null then return coalesce(report.task_id,report.general_task_id); end if;
  if nullif(p_project_external_id,'') is not null then
    select id into project_uuid from public.projects where external_id=p_project_external_id for update;
    if project_uuid is null then raise exception 'Choose an available project'; end if;
  end if;
  if report.project_id is not null and report.project_id is distinct from project_uuid then raise exception 'The fix must belong to the report project'; end if;
  if not public.can_manage_workspace() and (p_assignee_id is distinct from auth.uid() or (project_uuid is not null and not public.employee_can_access_project(project_uuid))) then raise exception 'Create tasks only for yourself in assigned projects' using errcode='42501'; end if;
  select coalesce(nullif(trim(display_name),''),split_part(email,'@',1)) into assigned_name from public.workspace_members where user_id=p_assignee_id and role in ('admin','project_manager','employee') limit 1;
  if assigned_name is null then raise exception 'Choose a member from the workspace directory'; end if;
  external_key='QA-'||report.id::text;
  if project_uuid is null then
    insert into public.general_tasks(external_id,created_by,task) values(external_key,auth.uid(),jsonb_build_object(
      'id',external_key,'title',report.title,'description',report.details,'kind',case when report.kind='BUG' then 'QA_BUG' else 'FEATURE_DEV' end,
      'assigneeId',p_assignee_id,'assignee',assigned_name,'assignees',jsonb_build_array(jsonb_build_object('userId',p_assignee_id,'name',assigned_name)),
      'priority','P3','estimatedHours',0,'loggedHours',0,'status','TO_DO','createdAt',now())) returning id into task_uuid;
    update public.qa_reports set general_task_id=task_uuid where id=report.id;
  else
    insert into public.project_work_items(project_id,external_id,title,description,kind,assignee_user_id,assignee_name,assignees,priority,estimated_hours,logged_hours,status)
    values(project_uuid,external_key,report.title,report.details,case when report.kind='BUG' then 'QA_BUG' else 'FEATURE_DEV' end,p_assignee_id,assigned_name,jsonb_build_array(jsonb_build_object('userId',p_assignee_id,'name',assigned_name)),'P3',0,0,'TO_DO') returning id into task_uuid;
    update public.projects set revision=revision+1 where id=project_uuid;
    update public.qa_reports set project_id=project_uuid,task_id=task_uuid where id=report.id;
  end if;
  return task_uuid;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."assign_qa_report"(uuid, text, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.audit_attendance_record()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end; $function$;

REVOKE ALL ON FUNCTION "public"."audit_attendance_record"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.bootstrap_workspace_admin (
  p_user_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare result uuid; account_email text;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-admin-bootstrap',0));
  if exists(select 1 from public.workspace_members where role = 'admin') then raise exception 'An administrator already exists'; end if;
  select lower(email) into account_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if account_email is null then raise exception 'Verified account required'; end if;
  insert into public.workspace_members(user_id,email,role) values(p_user_id,account_email,'admin')
    on conflict(email) do update set role='admin',user_id=excluded.user_id returning id into result;
  return result;
end; $function$;

REVOKE ALL ON FUNCTION "public"."bootstrap_workspace_admin"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.can_manage_workspace()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select coalesce(public.current_workspace_role() in ('admin','project_manager'),false); $function$;

CREATE OR REPLACE FUNCTION public.claim_initial_admin()
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ begin raise exception 'Administrator setup requires the server administrator endpoint'; end; $function$;

REVOKE ALL ON FUNCTION "public"."claim_initial_admin"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.clear_ineligible_project_manager()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if TG_OP = 'DELETE' then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
    return old;
  end if;
  if old.role = 'project_manager' and (new.role <> 'project_manager' or new.user_id is distinct from old.user_id) then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_password_change_requirement()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  update public.workspace_members
    set must_change_password = false, updated_at = now()
    where user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$function$;

CREATE OR REPLACE FUNCTION public.client_can_access_project (
  p_project_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select public.current_workspace_role()='client' and exists(
  select 1 from public.project_clients pc join public.clients c on c.id=pc.client_id
  where pc.project_id=p_project_id and c.client_user_id=auth.uid()
); $function$;

REVOKE ALL ON FUNCTION "public"."client_can_access_project"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.correct_attendance_checkout (
  p_session  uuid,
  p_checkout timestamp with time zone,
  p_reason   text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare visit public.attendance_sessions; settings public.attendance_settings; hours numeric;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can correct attendance.'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Enter a correction reason (3–2000 characters).'; end if;
 select * into visit from public.attendance_sessions where id=p_session;
 if not found then raise exception 'Visit not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(visit.user_id::text,418210));
 select * into visit from public.attendance_sessions where id=p_session for update;
 select * into settings from public.attendance_settings where id=true;
 if p_checkout is null or p_checkout<visit.checked_in_at or p_checkout>clock_timestamp() or (p_checkout at time zone settings.timezone)::date<>visit.work_date then raise exception 'Departure must be on the visit date, after arrival, and not in the future.'; end if;
 if exists(select 1 from public.attendance_sessions other where other.user_id=visit.user_id and other.id<>visit.id
   and other.checked_in_at<p_checkout and coalesce(other.checked_out_at,'infinity'::timestamptz)>visit.checked_in_at)
 then raise exception 'Departure overlaps another visit. Choose a time before the next arrival.'; end if;
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),to_jsonb(visit),to_jsonb(visit)||jsonb_build_object('checked_out_at',p_checkout,'reason',trim(p_reason)));
 update public.attendance_sessions set checked_out_at=p_checkout where id=visit.id;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,notes,source,updated_at) values(visit.user_id,visit.work_date,'PRESENT',least(round(hours,2),24),trim(p_reason),'qr',clock_timestamp())
 on conflict(user_id,work_date) do update set hours_logged=excluded.hours_logged,updated_at=excluded.updated_at where attendance_records.source='qr';
end; $function$;

REVOKE ALL ON FUNCTION "public"."correct_attendance_checkout"(uuid, timestamp WITH time zone, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.current_workspace_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select role from public.workspace_members where auth.uid() is not null and
  (user_id = auth.uid() or (user_id is null and lower(email) = lower(auth.jwt()->>'email')))
  order by (user_id = auth.uid()) desc nulls last limit 1; $function$;

CREATE OR REPLACE FUNCTION public.delete_resolved_qa_report (
  p_report_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not coalesce(public.can_manage_workspace(),false) then raise exception 'Only administrators and project managers can delete QA reports' using errcode='42501'; end if;
  delete from public.qa_reports where id=p_report_id and status='RESOLVED';
  if not found then raise exception 'Only resolved QA reports can be deleted. Refresh the reports and try again.'; end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."delete_resolved_qa_report"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.delete_resolved_review (
  p_review_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not coalesce(public.is_workspace_admin(),false) then raise exception 'Only administrators can delete reviews' using errcode='42501'; end if;
  delete from public.workspace_reviews where id=p_review_id and status='RESOLVED';
  if not found then raise exception 'Only resolved reviews can be deleted. Refresh the reviews and try again.'; end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."delete_resolved_review"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.employee_can_access_client (
  p_client_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.current_workspace_role() in ('employee','project_manager') and exists (
    select 1
    from public.projects p
    where p.client_id = p_client_id
      and public.employee_can_access_project(p.id)
  );
$function$;

REVOKE ALL ON FUNCTION "public"."employee_can_access_client"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.employee_can_access_project (
  p_project_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_workspace_admin() or exists(
    select 1 from public.project_team_members t where t.project_id=p_project_id and t.user_id=auth.uid()
  ) or exists(
    select 1 from public.project_work_items w where w.project_id=p_project_id and public.is_task_assignee(w.id)
  );
$function$;

REVOKE ALL ON FUNCTION "public"."employee_can_access_project"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.employee_existing_task_update_allowed (
  p_project_id uuid,
  p_data       jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare existing_row jsonb; item jsonb; old_item jsonb; field_name text; row_id uuid; mutable_field boolean;
  current_lead_external text; current_lead_internal uuid;
begin
  if jsonb_typeof(p_data->'row') <> 'object' then return false; end if;
  select to_jsonb(p) into existing_row from public.projects p where p.id=p_project_id;
  if existing_row is null then return false; end if;
  select l.external_id,p.lead_id into current_lead_external,current_lead_internal from public.projects p left join public.leads l on l.id=p.lead_id where p.id=p_project_id;
  if coalesce(p_data->>'leadId','') not in (coalesce(current_lead_external,''),coalesce(current_lead_internal::text,'')) then return false; end if;
  for field_name in select jsonb_object_keys(p_data->'row') loop
    if field_name in ('created_at','deadline') then
      if (p_data->'row'->>field_name)::timestamptz is distinct from (existing_row->>field_name)::timestamptz then return false; end if;
    elsif field_name in ('logo_data_url','objectives','deliverables','target_date','client_company','client_name','client_email','operating_company','start_date','scope_included','scope_excluded','assumptions','signed_contract_name','signed_contract_data_url') then
      if nullif(p_data->'row'->>field_name,'') is distinct from nullif(existing_row->>field_name,'') then return false; end if;
    elsif (p_data->'row'->field_name) is distinct from (existing_row->field_name) then return false; end if;
  end loop;
  if jsonb_array_length(coalesce(p_data->'team','[]'::jsonb)) <> (select count(*) from public.project_team_members where project_id=p_project_id)
    or (select count(*) from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) where value->>'link_type'<>'staging') <> (select count(*) from public.project_links where project_id=p_project_id and link_type<>'staging')
    or (select count(*) from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) where value->>'link_type'='staging') > 1
    or jsonb_array_length(coalesce(p_data->'workItems','[]'::jsonb)) <> (select count(*) from public.project_work_items where project_id=p_project_id)
    or (select count(distinct value) from jsonb_array_elements(coalesce(p_data->'team','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'team','[]'::jsonb))
    or (select count(distinct value->>'link_type') from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'links','[]'::jsonb))
    or (select count(distinct value->>'external_id') from jsonb_array_elements(coalesce(p_data->'workItems','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'workItems','[]'::jsonb)) then return false; end if;
  for item in select value from jsonb_array_elements(coalesce(p_data->'team','[]'::jsonb)) loop
    if not exists(select 1 from public.project_team_members t where t.project_id=p_project_id and t.role=item->>'role'
      and nullif(t.name,'') is not distinct from nullif(item->>'name','')
      and t.user_id is not distinct from nullif(item->>'user_id','')::uuid
      and t.allocation_percent is not distinct from (item->>'allocation_percent')::numeric) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) loop
    if item->>'link_type'='staging' then
      if nullif(item->>'url','') is null or item->>'url' !~* '^https?://' then return false; end if;
    elsif not exists(select 1 from public.project_links l where l.project_id=p_project_id and l.link_type=item->>'link_type' and l.url=item->>'url') then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_data->'workItems','[]'::jsonb)) loop
    select to_jsonb(w),w.id into old_item,row_id from public.project_work_items w where w.project_id=p_project_id and w.external_id=item->>'external_id';
    if old_item is null then return false; end if;
    for field_name in select jsonb_object_keys(item) loop
      mutable_field := field_name in ('status','logged_hours','blocker_reason','proof','review_notes','revision_requested','timer_started_at');
      if mutable_field and public.is_task_assignee(row_id) then
        continue;
      end if;
      if field_name in ('created_at','deadline') then
        if (item->>field_name)::timestamptz is distinct from (old_item->>field_name)::timestamptz then return false; end if;
      elsif field_name='assignee_name' then
        if nullif(item->>field_name,'') is distinct from nullif(old_item->>field_name,'') then return false; end if;
      elsif (item->field_name) is distinct from (old_item->field_name) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end; $function$;

REVOKE ALL ON FUNCTION "public"."employee_existing_task_update_allowed"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.employee_general_task_save_allowed (
  p_id   uuid,
  p_task jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare previous jsonb;
begin
  if public.current_workspace_role()<>'employee' then return false; end if;
  if p_id is null then
    return p_task->>'assigneeId'=auth.uid()::text and jsonb_array_length(p_task->'assignees')=1
      and p_task->'assignees'->0->>'userId'=auth.uid()::text and p_task->>'status'='TO_DO'
      and (p_task->>'loggedHours')::numeric=0 and nullif(p_task->>'timerStartedAt','') is null
      and nullif(p_task->>'blockerReason','') is null and coalesce(p_task->'proof','{}')='{}'::jsonb
      and nullif(p_task->>'reviewNotes','') is null and not coalesce((p_task->>'revisionRequested')::boolean,false);
  end if;
  select task into previous from public.general_tasks where id=p_id;
  if previous is null or not (previous->>'assigneeId'=auth.uid()::text or exists(select 1 from jsonb_array_elements(previous->'assignees') person where person->>'userId'=auth.uid()::text)) then return false; end if;
  return (previous-array['status','loggedHours','blockerReason','proof','reviewNotes','revisionRequested','timerStartedAt'])
    = (p_task-array['status','loggedHours','blockerReason','proof','reviewNotes','revisionRequested','timerStartedAt']);
exception when others then return false;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."employee_general_task_save_allowed"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.employee_project_task_update_allowed (
  p_project_id uuid,
  p_data       jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare item jsonb; field_name text; existing_items jsonb='[]'::jsonb; added integer=0; checked jsonb=p_data;
begin
  if public.current_workspace_role()<>'employee' or not public.employee_can_access_project(p_project_id) then return false; end if;
  if jsonb_typeof(p_data->'workItems')<>'array' then return false; end if;
  if (select count(distinct value->>'external_id') from jsonb_array_elements(p_data->'workItems'))<>jsonb_array_length(p_data->'workItems') then return false; end if;
  for item in select value from jsonb_array_elements(p_data->'workItems') loop
    if exists(select 1 from public.project_work_items w where w.project_id=p_project_id and w.external_id=item->>'external_id') then
      existing_items=existing_items||jsonb_build_array(item);
      continue;
    end if;
    added=added+1;
    for field_name in select jsonb_object_keys(item) loop
      if field_name not in ('external_id','title','description','deadline','kind','assignee_name','assignee_user_id','assignees','priority','estimated_hours','logged_hours','status','blocker_reason','proof','review_notes','revision_requested','timer_started_at','created_at') then return false; end if;
    end loop;
    if nullif(trim(item->>'external_id'),'') is null or nullif(trim(item->>'title'),'') is null or length(item->>'title')>1000
      or length(coalesce(item->>'description',''))>5000
      or (item->>'assignee_user_id')::uuid is distinct from auth.uid()
      or nullif(trim(item->>'assignee_name'),'') is null
      or jsonb_typeof(item->'assignees') is distinct from 'array'
      or jsonb_array_length(item->'assignees')<>1
      or (item->'assignees'->0->>'userId')::uuid is distinct from auth.uid()
      or nullif(trim(item->'assignees'->0->>'name'),'') is null
      or (item->>'status') is distinct from 'TO_DO'
      or (item->>'logged_hours')::numeric is distinct from 0
      or coalesce((item->>'estimated_hours')::numeric,-1)<0
      or nullif(item->>'blocker_reason','') is not null
      or coalesce(item->'proof','{}'::jsonb)<>'{}'::jsonb
      or nullif(item->>'review_notes','') is not null
      or coalesce((item->>'revision_requested')::boolean,false)
      or nullif(item->>'timer_started_at','') is not null
      then return false; end if;
  end loop;
  checked=jsonb_set(checked,'{workItems}',existing_items);
  -- The assignment trigger advances an active project when its first task is created.
  if added>0 and checked->'row'->>'status'='ON_TRACK' and exists(select 1 from public.projects where id=p_project_id and status='ACTIVE') then
    checked=jsonb_set(checked,'{row,status}','"ACTIVE"'::jsonb);
  end if;
  return public.employee_existing_task_update_allowed(p_project_id,checked);
exception when others then return false;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."employee_project_task_update_allowed"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_internal_workspace_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select coalesce(public.current_workspace_role() in ('admin','employee','project_manager'),false); $function$;

CREATE OR REPLACE FUNCTION public.is_task_assignee (
  p_task_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select exists(select 1 from public.project_work_items w where w.id=p_task_id and (
  w.assignee_user_id=auth.uid() or exists(select 1 from jsonb_array_elements(w.assignees) person where person->>'userId'=auth.uid()::text)
)); $function$;

REVOKE ALL ON FUNCTION "public"."is_task_assignee"(uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.is_workspace_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ select coalesce(public.current_workspace_role()='admin',false); $function$;

CREATE OR REPLACE FUNCTION public.issue_attendance_challenge()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare challenge public.attendance_challenges; settings public.attendance_settings;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can display the office QR.'; end if;
 perform pg_advisory_xact_lock(418209);
 select * into settings from public.attendance_settings where id=true;
 delete from public.attendance_challenges where expires_at<clock_timestamp()-interval '1 day';
 select * into challenge from public.attendance_challenges where expires_at>clock_timestamp()+interval '10 seconds' order by created_at desc limit 1;
 if not found then insert into public.attendance_challenges default values returning * into challenge; end if;
 return jsonb_build_object('token',challenge.token,'expiresAt',challenge.expires_at,'serverTime',clock_timestamp(),'officeName',settings.office_name,'timezone',settings.timezone);
end; $function$;

REVOKE ALL ON FUNCTION "public"."issue_attendance_challenge"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.keep_workspace_admin()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ begin
  if old.role='admin' and (tg_op='DELETE' or new.role<>'admin') then
    perform pg_advisory_xact_lock(hashtextextended('workspace-admin-bootstrap',0));
    if not exists(select 1 from public.workspace_members where role='admin' and id<>old.id) then
      raise exception 'The workspace must keep at least one administrator';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.notify_general_task_assignment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare person jsonb;
begin
  for person in select value from jsonb_array_elements(new.task->'assignees') loop
    if TG_OP='INSERT' or not exists(select 1 from jsonb_array_elements(old.task->'assignees') previous where previous->>'userId'=person->>'userId') then
      insert into public.workspace_notifications(recipient_id,type,title,message,link) values((person->>'userId')::uuid,'TASK','Task assigned',new.task->>'title','/work');
    end if;
  end loop;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."notify_general_task_assignment"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.prevent_project_type_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$ begin
  if new.project_type is distinct from old.project_type then
    raise exception 'Project type cannot be changed after creation';
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.project_status_after_task_assignment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if (new.assignee_user_id is not null or nullif(trim(new.assignee_name),'') is not null or jsonb_array_length(new.assignees)>0)
    and (tg_op='INSERT' or new.assignee_user_id is distinct from old.assignee_user_id
      or new.assignee_name is distinct from old.assignee_name
      or new.assignees is distinct from old.assignees
      or new.project_id is distinct from old.project_id) then
    update public.projects set status='ON_TRACK' where id=new.project_id and status='ACTIVE';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."project_status_after_task_assignment"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.read_client_projects()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'external_id',p.external_id,'title',p.title,'logo_data_url',p.logo_data_url,'client_company',coalesce(nullif(trim(p.client_company),''),(select c.company_name from public.clients c where c.id=p.client_id)),'status',p.status,
      'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'status',w.status) order by w.created_at,w.id) from public.project_work_items w where w.project_id=p.id),'[]'::jsonb),
      'details',jsonb_build_object('services',p.services,'start_date',p.start_date,'scope_included',p.scope_included,'scope_excluded',p.scope_excluded,'assumptions',p.assumptions),
      'total_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id),
      'completed_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id and w.status='DONE')
    ) order by p.created_at desc,p.id)
    from public.projects p
    where public.client_can_access_project(p.id)
  ),'[]'::jsonb);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."read_client_projects"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.read_client_records()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare result jsonb;
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  with accounts as (select id from public.clients where client_user_id=auth.uid()),
  shared_proposals as (
    select p.* from public.proposals p where p.status in ('SENT','ACCEPTED','DECLINED','CHANGES_REQUESTED','SUPERSEDED')
    and (p.client_id in (select id from accounts) or (p.client_id is null and exists(select 1 from public.leads l where l.id=p.lead_id and l.client_id in(select id from accounts))))
  ), issued_invoices as (
    select i.* from public.invoices i where i.status in ('SENT','CONFIRMED_PAID')
    and (i.client_id in(select id from accounts) or (i.client_id is null and (
      exists(select 1 from public.projects p where p.id=i.project_id and p.client_id in(select id from accounts))
      or exists(select 1 from public.leads l where l.id=i.lead_id and l.client_id in(select id from accounts)))))
  ), documents as (
    select p.id, p.document_name as name, p.document_data_url as url, 'Proposal'::text as kind
    from shared_proposals p where nullif(p.document_name,'') is not null and nullif(p.document_data_url,'') is not null
    union all
    select l.id,l.acceptance_document_name,l.acceptance_document_data_url,'Acceptance'
    from public.leads l where l.client_id in(select id from accounts) and l.status in('ACCEPTED','CONVERTED')
    and nullif(l.acceptance_document_name,'') is not null and nullif(l.acceptance_document_data_url,'') is not null
  )
  select jsonb_build_object(
    'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',proposal_title,'project_title',project_title,'client_name',(select coalesce(nullif(l.company_name,''),l.full_name) from public.leads l where l.id=lead_id),'version',version,'status',status,'accepted_by',coalesce(response_name,(select l.acceptance_name from public.leads l where l.id=lead_id)),'accepted_at',coalesce(responded_at,(select l.accepted_at from public.leads l where l.id=lead_id)),'review_path',case when status <> 'SUPERSEDED' and share_token is not null then '/proposal/'||share_token else null end,'expiry_date',expiry_date,'amount',quoted_amount,'currency',currency,'scope',scope_included,'deliverables',deliverables,'timeline',timeline,'payment_terms',payment_terms) order by created_at desc,id) from shared_proposals),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',invoice_number,'transaction_reference',transaction_reference,'bill_to',bill_to,'operating_company',operating_company,'gst_enabled',gst_enabled,'contract_value',contract_value,'deposit_amount',deposit_amount,'quantity',quantity,'unit_price',unit_price,'subtotal',subtotal,'gst_amount',gst_amount,'gst_rate',gst_rate,'confirmed_paid_at',confirmed_paid_at,'description',description,'status',status,'total',total,'currency',currency,'issue_date',issue_date,'due_date',due_date,'payment_terms',payment_terms,'payment_instructions',payment_instructions) order by created_at desc,id) from issued_invoices),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'url',url,'kind',kind) order by kind,name,id) from documents),'[]'::jsonb)
  ) into result;
  return result;
end $function$;

REVOKE ALL ON FUNCTION "public"."read_client_records"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.read_shared_proposal (
  p_token text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare proposal public.proposals; lead public.leads;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into proposal from public.proposals where share_token=p_token and status in ('SENT','ACCEPTED','DECLINED','CHANGES_REQUESTED');
  if not found then raise exception 'Proposal unavailable'; end if;
  select * into lead from public.leads where id=proposal.lead_id;
  if proposal.status='SENT' and proposal.viewed_at is null then
    update public.proposals set viewed_at=now() where id=proposal.id returning * into proposal;
    update public.leads set revision=revision+1 where id=lead.id;
  end if;
  return jsonb_build_object('proposal',to_jsonb(proposal)-'created_by'-'client_id'-'attachment_path',
    'lead',jsonb_build_object('id',lead.external_id,'fullName',lead.full_name,'companyName',lead.company_name,'description',null,'email',null,'phone',null));
end; $function$;

REVOKE ALL ON FUNCTION "public"."read_shared_proposal"(text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_workspace_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare before_row jsonb; after_row jsonb; row_data jsonb; changed text[]; project_row public.projects;
begin
  if TG_OP <> 'INSERT' then before_row=to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then after_row=to_jsonb(new); end if;
  if TG_OP='UPDATE' and (before_row - 'updated_at' - 'revision')=(after_row - 'updated_at' - 'revision') then return new; end if;
  row_data=coalesce(after_row,before_row);
  select array_agg(key order by key) into changed from jsonb_object_keys(row_data) key
    where key not in ('updated_at','revision') and before_row->key is distinct from after_row->key;
  insert into public.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),TG_TABLE_NAME,(row_data->>'id')::uuid,TG_OP,jsonb_build_object(
      'label',coalesce(row_data->>'title',row_data->>'full_name',row_data->>'display_name',row_data->>'email',row_data->>'id'),
      'fields',changed,'previous_status',before_row->>'status','status',after_row->>'status',
      'previous_role',before_row->>'role','role',after_row->>'role'));
  if TG_TABLE_NAME='leads' and TG_OP='INSERT' then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      select distinct user_id,'LEAD','New lead',row_data->>'full_name','/requests#'||coalesce(row_data->>'external_id',row_data->>'id')
      from public.workspace_members where role='admin' and user_id is not null;
  elsif TG_TABLE_NAME='project_work_items' and TG_OP<>'DELETE' then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      select recipients.user_id,'TASK','Task assigned to you',after_row->>'title','/work'
      from (select nullif(after_row->>'assignee_user_id','')::uuid user_id
        union select (person->>'userId')::uuid from jsonb_array_elements(coalesce(after_row->'assignees','[]'::jsonb)) person) recipients
      where recipients.user_id is not null and (TG_OP='INSERT' or not exists(
        select 1 from (select nullif(before_row->>'assignee_user_id','')::uuid user_id
          union select (person->>'userId')::uuid from jsonb_array_elements(coalesce(before_row->'assignees','[]'::jsonb)) person) previous
        where previous.user_id=recipients.user_id));
  elsif TG_TABLE_NAME='projects' and TG_OP='UPDATE' and before_row->>'status' is distinct from after_row->>'status' then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      select recipients.user_id,'PROJECT','Project status changed',new.title||': '||new.status,
        case when exists(select 1 from public.workspace_members m where m.user_id=recipients.user_id and m.role='client') then '/client/projects' else '/projects/'||coalesce(new.external_id,new.id::text) end
      from (
        select user_id from public.project_team_members where project_id=new.id
        union select assignee_user_id from public.project_work_items where project_id=new.id
        union select (person->>'userId')::uuid from public.project_work_items w cross join lateral jsonb_array_elements(w.assignees) person where w.project_id=new.id
        union select client_user_id from public.clients where id=new.client_id
      ) recipients where recipients.user_id is not null;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.reject_internal_project_commercial_link()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare target_id uuid;
begin
  if TG_TABLE_NAME = 'invoices' then target_id=new.project_id;
  else target_id=new.source_project_id; end if;
  if exists(select 1 from public.projects where id=target_id and project_type='internal') then
    raise exception 'Internal projects cannot have invoices or retainer plans';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_workspace_number (
  p_kind    text,
  p_company text DEFAULT 'Evecture'::text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare prefix text; max_existing bigint; allocated bigint; counter text; yr text=extract(year from current_date)::text;
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required'; end if;
  if p_kind not in ('project','invoice','retainer') or p_company not in ('Evecture','Servn') then raise exception 'Invalid number request'; end if;
  prefix := case when p_kind='project' then 'EVE-'||yr||'-' when p_kind='retainer' then 'RET-'||yr||'-' else (case when p_company='Servn' then 'SER' else 'EVE' end)||'-INV-'||yr||'-' end;
  counter := p_kind||':'||prefix;
  perform pg_advisory_xact_lock(hashtextextended(counter,0));
  if p_kind='project' then
    select coalesce(max(substring(external_id from length(prefix)+1)::bigint),0) into max_existing from public.projects where external_id ~ ('^'||prefix||'[0-9]+$');
  elsif p_kind='retainer' then
    select coalesce(max(substring(external_id from length(prefix)+1)::bigint),0) into max_existing from public.managed_projects where external_id ~ ('^'||prefix||'[0-9]+$');
  else
    select coalesce(max(substring(invoice_number from length(prefix)+1)::bigint),0) into max_existing from public.invoices where invoice_number ~ ('^'||prefix||'[0-9]+$');
  end if;
  insert into public.workspace_number_counters values(counter,max_existing+1)
    on conflict(counter_key) do update set last_value=greatest(workspace_number_counters.last_value,max_existing)+1 returning last_value into allocated;
  return prefix||lpad(allocated::text,greatest(3,length(allocated::text)),'0');
end; $function$;

REVOKE ALL ON FUNCTION "public"."reserve_workspace_number"(text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.respond_shared_proposal (
  p_token    text,
  p_response text,
  p_name     text,
  p_note     text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare proposal public.proposals;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into proposal from public.proposals where share_token=p_token for update;
  if not found or proposal.status<>'SENT' then raise exception 'This proposal is no longer open for responses'; end if;
  if p_response not in ('ACCEPTED','DECLINED','CHANGES_REQUESTED') then raise exception 'Invalid response'; end if;
  if proposal.expiry_date < (now() at time zone 'UTC')::date then raise exception 'This proposal has expired. Request an updated version.'; end if;
  if (p_response='ACCEPTED' and length(trim(coalesce(p_name,'')))=0) or (p_response<>'ACCEPTED' and length(trim(coalesce(p_note,'')))=0) then raise exception 'Response details are required'; end if;
  if length(coalesce(p_name,''))>200 or length(coalesce(p_note,''))>10000 then raise exception 'Response is too long'; end if;
  update public.proposals set status=p_response,responded_at=now(),response_name=nullif(trim(p_name),''),response_note=nullif(trim(p_note),'') where id=proposal.id;
  update public.leads set status=case p_response when 'ACCEPTED' then 'ACCEPTED' when 'DECLINED' then 'LOST' else 'PROPOSAL_SENT' end,
    accepted_at=case when p_response='ACCEPTED' then now() else accepted_at end,
    acceptance_name=case when p_response='ACCEPTED' then trim(p_name) else acceptance_name end,
    disqualification_reason=case when p_response='DECLINED' then 'Client declined: '||trim(p_note) else disqualification_reason end,revision=revision+1 where id=proposal.lead_id;
  insert into public.proposal_events(proposal_id,event_type,note) values(proposal.id,p_response,concat_ws(': ',nullif(p_name,''),nullif(p_note,''))); 
end; $function$;

REVOKE ALL ON FUNCTION "public"."respond_shared_proposal"(text, text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_workspace_changes (
  p_changes    jsonb,
  p_request_id uuid  DEFAULT gen_random_uuid()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare
  change jsonb; data jsonb; payload jsonb; item jsonb; child jsonb; root_id uuid; child_id uuid; proposal_id_value uuid;
  client_id_value uuid; lead_id_value uuid; project_id_value uuid; existing_revision bigint; expected bigint;
  table_name text; key_name text; collection_name text; external_key text; kept uuid[]; follow_kept uuid[];
  output jsonb='{}'::jsonb; replay public.workspace_mutations;
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required'; end if;
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>1000 then raise exception 'Invalid change batch'; end if;
  -- One graph operation at a time; row revisions reject stale sessions rather than overwriting them.
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into replay from public.workspace_mutations where request_id=p_request_id;
  if found then
    if replay.actor_id<>auth.uid() or replay.payload_hash<>md5(p_changes::text) then raise exception 'Invalid save request identifier'; end if;
    return replay.result;
  end if;

  for change in select value from jsonb_array_elements(p_changes) order by case value->>'collection' when 'leads' then 1 when 'projects' then 2 when 'management' then 3 when 'invoices' then 4 else 5 end loop
    collection_name=change->>'collection'; external_key=change->>'id';
    table_name=case collection_name when 'leads' then 'leads' when 'projects' then 'projects' when 'management' then 'managed_projects' when 'invoices' then 'invoices' when 'generalTasks' then 'general_tasks' end;
    if table_name is null or external_key is null then raise exception 'Invalid collection or record'; end if;
    key_name=case when collection_name='invoices' then 'invoice_number' else 'external_id' end;
    expected=(change->>'expectedRevision')::bigint;
    root_id=null; existing_revision=null;
    execute format('select id,revision from public.%I where %I=$1 for update',table_name,key_name) using external_key into root_id,existing_revision;
    if (root_id is not null and (expected is null or expected<>existing_revision)) or (root_id is null and expected is not null) then
      raise exception 'CONFLICT: % was changed or deleted in another session. Reload the latest data.',external_key using errcode='40001';
    end if;
    if not public.can_manage_workspace() then
      if collection_name='generalTasks' then
        if change->>'operation'<>'save' or not coalesce(public.employee_general_task_save_allowed(root_id,change->'data'->'row'->'task'),false) then raise exception 'Employees can create general tasks for themselves and update only their assigned progress.'; end if;
      else
      if collection_name<>'projects' or change->>'operation'<>'save' or root_id is null
        or not exists(select 1 from public.projects p where p.id=root_id and (
          exists(select 1 from public.project_team_members t where t.project_id=p.id and t.user_id=auth.uid())
          or exists(select 1 from public.project_work_items w where w.project_id=p.id and public.is_task_assignee(w.id))
        )) or not public.employee_project_task_update_allowed(root_id,change->'data') then
        raise exception 'Employees can update only their own assigned task progress.';
      end if;
      end if;
    end if;
    if change->>'operation'='delete' then
      if collection_name='projects' and not public.can_manage_workspace() then raise exception 'Only administrators can delete projects'; end if;
      execute format('delete from public.%I where id=$1',table_name) using root_id;
      output=output||jsonb_build_object(collection_name||':'||external_key,-1);
      continue;
    end if;
    if change->>'operation'<>'save' then raise exception 'Invalid operation'; end if;
    data=change->'data'; payload=(data->'row')-'id'-'revision'-'created_by';
    root_id=coalesce(root_id,gen_random_uuid());
    payload=payload||jsonb_build_object('id',root_id,key_name,external_key,'revision',coalesce(existing_revision,-1)+1);
    if collection_name='leads' then
      client_id_value=public.workspace_client(coalesce(payload->>'company_name',payload->>'full_name'),payload->>'full_name',payload->>'email');
      payload=payload||jsonb_build_object('client_id',client_id_value,'created_by',auth.uid());
    elsif collection_name='projects' then
      if public.can_manage_workspace() then
        if payload->>'project_type' = 'internal' then
          if nullif(data->>'leadId','') is not null then raise exception 'Internal projects cannot be linked to leads'; end if;
          lead_id_value=null; proposal_id_value=null; client_id_value=null;
        else
        select id into lead_id_value from public.leads where external_id=data->>'leadId';
        if nullif(data->>'leadId','') is not null and lead_id_value is null then raise exception 'Linked lead does not exist'; end if;
        select id into proposal_id_value from public.proposals where lead_id=lead_id_value and version=(data->>'proposalVersion')::integer;
        client_id_value=public.workspace_client(coalesce(payload->>'client_company',payload->>'client_name'),payload->>'client_name',payload->>'client_email');
        end if;
      else
        select lead_id,proposal_id,client_id into lead_id_value,proposal_id_value,client_id_value from public.projects where id=root_id;
      end if;
      payload=(payload-'deposit_amount'-'deposit_status')||jsonb_build_object('lead_id',lead_id_value,'proposal_id',proposal_id_value,'client_id',client_id_value);
    elsif collection_name='generalTasks' then
      payload=payload||jsonb_build_object('created_by',auth.uid());
    elsif collection_name='management' then
      select id into project_id_value from public.projects where external_id=data->>'sourceProjectId';
      if nullif(data->>'sourceProjectId','') is not null and project_id_value is null then raise exception 'Linked project does not exist'; end if;
      payload=payload||jsonb_build_object('source_project_id',project_id_value);
    elsif collection_name='invoices' then
      select id into lead_id_value from public.leads where external_id=data->>'leadId';
      select id into project_id_value from public.projects where external_id=data->>'projectId';
      if (nullif(data->>'leadId','') is not null and lead_id_value is null) or (nullif(data->>'projectId','') is not null and project_id_value is null) then raise exception 'Linked invoice account does not exist'; end if;
      if (payload->>'total')::numeric < 0 or (payload->>'gst_rate')::numeric not between 0 and 100 or (payload->>'quantity')::numeric<=0
        or (payload->>'unit_price')::numeric<0
        or round((payload->>'quantity')::numeric*(payload->>'unit_price')::numeric,2)<>(payload->>'subtotal')::numeric
        or (payload->>'gst_amount')::numeric<>(case when (payload->>'gst_enabled')::boolean then round((payload->>'subtotal')::numeric*(payload->>'gst_rate')::numeric/100,2) else 0 end)
        or (payload->>'total')::numeric<>round((payload->>'subtotal')::numeric+(payload->>'gst_amount')::numeric,2)
        or (payload->>'due_date')::date<(payload->>'issue_date')::date
      then raise exception 'Invalid invoice amounts, tax or dates'; end if;
      if project_id_value is not null then
        if (payload->>'is_deposit')::boolean and exists(select 1 from public.projects where id=project_id_value and currency is distinct from payload->>'currency') then raise exception 'Deposit currency must match the project'; end if;
        if lead_id_value is not null and exists(select 1 from public.projects where id=project_id_value and lead_id is distinct from lead_id_value) then raise exception 'Invoice lead must match its project'; end if;
        select client_id,coalesce(lead_id_value,lead_id) into client_id_value,lead_id_value from public.projects where id=project_id_value;
      elsif lead_id_value is not null then select client_id into client_id_value from public.leads where id=lead_id_value;
      else client_id_value=public.workspace_client(payload->>'bill_to',payload->>'client_name',payload->>'client_email'); end if;
      payload=payload||jsonb_build_object('lead_id',lead_id_value,'project_id',project_id_value,'client_id',client_id_value);
    end if;
    perform public.workspace_upsert_row(table_name,payload,key_name);
    output=output||jsonb_build_object(collection_name||':'||external_key,coalesce(existing_revision,-1)+1);

    if collection_name='leads' then
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'proposals','[]')) loop
        select id into child_id from public.proposals where lead_id=root_id and version=(item->'row'->>'version')::integer;
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('proposals',((item->'row')-'id')||jsonb_build_object('id',child_id,'lead_id',root_id,'client_id',client_id_value));
        follow_kept='{}';
        for child in select value from jsonb_array_elements(coalesce(item->'followUps','[]')) loop
          select id into proposal_id_value from public.proposal_follow_ups where proposal_id=child_id and label=child->>'label' limit 1;
          proposal_id_value=coalesce(proposal_id_value,gen_random_uuid()); follow_kept=array_append(follow_kept,proposal_id_value);
          perform public.workspace_upsert_row('proposal_follow_ups',child||jsonb_build_object('id',proposal_id_value,'proposal_id',child_id));
        end loop;
        delete from public.proposal_follow_ups where proposal_id=child_id and not(id=any(follow_kept));
      end loop;
      delete from public.proposals where lead_id=root_id and not(id=any(kept));
    elsif collection_name='projects' then
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'team','[]')) loop
        select id into child_id from public.project_team_members where project_id=root_id and role=item->>'role' and name is not distinct from item->>'name' limit 1;
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_team_members',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_team_members where project_id=root_id and not(id=any(kept));
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'workItems','[]')) loop
        select id into child_id from public.project_work_items where project_id=root_id and external_id=item->>'external_id';
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_work_items',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_work_items where project_id=root_id and not(id=any(kept));
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'links','[]')) loop
        if item->>'url' !~* '^https?://' then raise exception 'Project links must use http or https'; end if;
        select id into child_id from public.project_links where project_id=root_id and link_type=item->>'link_type';
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_links',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_links where project_id=root_id and not(id=any(kept));
    end if;
  end loop;
  insert into public.workspace_mutations(request_id,actor_id,payload_hash,result) values(p_request_id,auth.uid(),md5(p_changes::text),output);
  delete from public.workspace_mutations where created_at<now()-interval '30 days';
  return output;
end; $function$;

REVOKE ALL ON FUNCTION "public"."save_workspace_changes"(jsonb, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.scan_attendance (
  p_token  uuid,
  p_action text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare actor uuid:=auth.uid(); visit public.attendance_sessions; settings public.attendance_settings;
 stamp timestamptz; day date; hours numeric;
begin
 if actor is null or not public.is_internal_workspace_user() then raise exception 'Employee workspace access required.'; end if;
 if p_action is null or p_action not in ('check_in','check_out') then raise exception 'Choose check in or check out.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,418210));
 stamp:=clock_timestamp();
 -- Retrying the same explicit action cannot open or close another session.
 select * into visit from public.attendance_sessions where user_id=actor and
  ((p_action='check_in' and checkin_token=p_token) or (p_action='check_out' and checkout_token=p_token));
 if found then return to_jsonb(visit); end if;
 if not exists(select 1 from public.attendance_challenges where token=p_token and expires_at>stamp) then raise exception 'QR expired. Scan the current office QR and try again.'; end if;

 select * into settings from public.attendance_settings where id=true;
 day:=(stamp at time zone settings.timezone)::date;
 select * into visit from public.attendance_sessions where user_id=actor and checked_out_at is null for update;
 if p_action='check_in' then
  if found then raise exception 'You already have an open visit. Check out before checking in again.'; end if;
  insert into public.attendance_sessions(user_id,work_date,checked_in_at,checkin_token) values(actor,day,stamp,p_token) returning * into visit;
 else
  if not found then raise exception 'You are not checked in.'; end if;
  -- A forgotten checkout must be corrected by an admin, never counted as overnight work.
  if visit.work_date<>day then raise exception 'Missing checkout from a previous day. Ask an administrator to close the visit.'; end if;
  update public.attendance_sessions set checked_out_at=stamp,checkout_token=p_token where id=visit.id returning * into visit;
 end if;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=actor and work_date=day and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,source,updated_at)
 values(actor,day,'PRESENT',least(round(hours,2),24),'qr',stamp)
 on conflict(user_id,work_date) do update set status='PRESENT',hours_logged=excluded.hours_logged,updated_at=stamp
 where attendance_records.source='qr'; -- Preserve deliberate admin corrections.
 return to_jsonb(visit);
end; $function$;

REVOKE ALL ON FUNCTION "public"."scan_attendance"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_qa_report_status (
  p_report_id uuid,
  p_status    text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if not coalesce(public.can_manage_workspace(),false) then raise exception 'Only administrators and project managers can resolve QA reports' using errcode='42501'; end if;
  if p_status is null or p_status not in ('OPEN','RESOLVED') then raise exception 'Choose Open or Resolved'; end if;
  update public.qa_reports set status=p_status where id=p_report_id;
  if not found then raise exception 'The report no longer exists'; end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_qa_report_status"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_workspace_member_role (
  member_email        text,
  member_role         text,
  member_display_name text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare new_id uuid;
declare target_user_id uuid;
begin
  if not coalesce(public.is_workspace_admin(),false) then raise exception 'Only administrators can manage workspace roles'; end if;
  if member_role not in ('admin', 'employee', 'project_manager', 'client') then raise exception 'Invalid workspace role'; end if;
  select id into target_user_id from auth.users where lower(email) = lower(member_email) limit 1;
  insert into public.workspace_members (user_id, email, role, display_name)
  values (target_user_id, lower(member_email), member_role, member_display_name)
  on conflict (email) do update set user_id = excluded.user_id, role = excluded.role, display_name = excluded.display_name, updated_at = now()
  returning id into new_id;
  return new_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_workspace_member_role"(text, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_workspace_review_reporter()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  new.reporter_user_id := auth.uid();
  -- Submission fields cannot impersonate an administrator response.
  new.status := 'OPEN';
  new.admin_note := null;
  select coalesce(nullif(display_name,''),split_part(email,'@',1)),email
    into new.reporter_name,new.reporter_email
    from public.workspace_members
    where user_id=auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
    order by (user_id=auth.uid()) desc
    limit 1;
  if new.reporter_name is null then
    new.reporter_name := coalesce(auth.jwt()->>'email','Workspace user');
    new.reporter_email := auth.jwt()->>'email';
  end if;
  return new;
end; $function$;

REVOKE ALL ON FUNCTION "public"."set_workspace_review_reporter"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.submit_invoice_payment_reference (
  p_invoice_id uuid,
  p_reference  text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare inv public.invoices;
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reference,''))) > 200 then
    raise exception 'Enter a payment reference of up to 200 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select i.* into inv from public.invoices i where i.id=p_invoice_id and (
    exists(select 1 from public.clients c where c.id=i.client_id and c.client_user_id=auth.uid())
    or (i.client_id is null and (
      exists(select 1 from public.projects p join public.clients c on c.id=p.client_id where p.id=i.project_id and c.client_user_id=auth.uid())
      or exists(select 1 from public.leads l join public.clients c on c.id=l.client_id where l.id=i.lead_id and c.client_user_id=auth.uid())
    ))) for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status<>'SENT' then raise exception 'This invoice is not awaiting payment'; end if;
  insert into public.invoice_payment_references(invoice_id,reference,submitted_by)
    values(inv.id,trim(coalesce(p_reference,'')),auth.uid())
    on conflict(invoice_id) do update set reference=excluded.reference,submitted_by=excluded.submitted_by,submitted_at=now();
end $function$;

REVOKE ALL ON FUNCTION "public"."submit_invoice_payment_reference"(uuid, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.submit_qa_report (
  p_id                  uuid,
  p_kind                text,
  p_title               text,
  p_details             text,
  p_project_external_id text DEFAULT NULL::text,
  p_assignee_id         uuid DEFAULT NULL::uuid,
  p_image_data_url      text DEFAULT NULL::text,
  p_image_name          text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare project_uuid uuid; existing public.qa_reports; image_value text=nullif(p_image_data_url,''); image_filename text=nullif(trim(p_image_name),'');
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  if p_project_external_id is not null then
    select id into project_uuid from public.projects where external_id=p_project_external_id;
    if project_uuid is null then raise exception 'Choose an available project'; end if;
    if not public.can_manage_workspace() and not public.employee_can_access_project(project_uuid) then raise exception 'Choose one of your assigned projects' using errcode='42501'; end if;
  end if;
  if not public.valid_compressed_image(image_value,358400) then raise exception 'Choose a compressed PNG, JPG, or WebP image up to 350 KB'; end if;
  select * into existing from public.qa_reports where id=p_id;
  if found then
    if existing.created_by<>auth.uid() or existing.kind is distinct from p_kind or existing.title is distinct from trim(p_title) or existing.details is distinct from trim(p_details)
      or existing.image_data_url is distinct from image_value or existing.image_name is distinct from image_filename then raise exception 'Invalid report save identifier'; end if;
    return existing.id;
  end if;
  insert into public.qa_reports(id,kind,title,details,project_id,created_by,image_data_url,image_name) values(p_id,p_kind,trim(p_title),trim(p_details),project_uuid,auth.uid(),image_value,image_filename);
  if p_assignee_id is not null then perform public.assign_qa_report(p_id,p_project_external_id,p_assignee_id); end if;
  return p_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."submit_qa_report"(uuid, text, text, text, text, uuid, text, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.sync_project_clients()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare participant jsonb; participant_id uuid;
begin
  if TG_OP='INSERT' and new.client_id is null and new.additional_clients='[]'::jsonb then return new; end if;
  if TG_OP='UPDATE' and new.additional_clients is not distinct from old.additional_clients and new.client_id is not distinct from old.client_id then return new; end if;
  if not coalesce(public.can_manage_workspace(),false) then raise exception 'Only project managers and administrators can change project clients' using errcode='42501'; end if;
  delete from public.project_clients where project_id=new.id;
  if new.client_id is not null then insert into public.project_clients values(new.id,new.client_id); end if;
  for participant in select value from jsonb_array_elements(new.additional_clients) loop
    if jsonb_typeof(participant)<>'object' or coalesce(nullif(trim(participant->>'name'),''),nullif(trim(participant->>'companyName'),'')) is null then raise exception 'Each project client needs a contact or company name'; end if;
    participant_id=public.workspace_client(coalesce(nullif(trim(participant->>'companyName'),''),trim(participant->>'name')),trim(participant->>'name'),coalesce(trim(participant->>'email'),''));
    insert into public.project_clients values(new.id,participant_id) on conflict do nothing;
  end loop;
  return new;
end $function$;

REVOKE ALL ON FUNCTION "public"."sync_project_clients"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$ begin new.updated_at = now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.valid_compressed_image (
  p_value     text,
  p_max_bytes integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
begin
  if p_value is null then return true; end if;
  if length(p_value)>((p_max_bytes+2)/3)*4+64 or p_value !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  return octet_length(decode(split_part(p_value,',',2),'base64')) between 1 and p_max_bytes;
exception when others then return false;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."valid_compressed_image"(text, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.validate_general_task()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare person jsonb; data jsonb=new.task;
begin
  if data->>'id' is distinct from new.external_id or nullif(trim(data->>'title'),'') is null or length(data->>'title')>1000 or length(coalesce(data->>'description',''))>5000
    or coalesce(data->>'status','') not in ('TO_DO','IN_PROGRESS','BLOCKED','UNDER_REVIEW','DONE')
    or coalesce(data->>'priority','') not in ('P1','P2','P3','P4')
    or coalesce(data->>'kind','') not in ('FEATURE_DEV','CLIENT_FEEDBACK_TODO','QA_BUG')
    or coalesce((data->>'estimatedHours')::numeric,-1)<0 or coalesce((data->>'loggedHours')::numeric,-1)<0
    or jsonb_typeof(data->'assignees') is distinct from 'array' or jsonb_array_length(data->'assignees') not between 1 and 100
    or data->>'assigneeId' is distinct from data->'assignees'->0->>'userId'
    or data->>'assignee' is distinct from data->'assignees'->0->>'name'
    then raise exception 'Invalid general task details'; end if;
  perform (data->>'createdAt')::timestamptz;
  if data->>'deadline' is not null then perform (data->>'deadline')::timestamptz; end if;
  for person in select value from jsonb_array_elements(data->'assignees') loop
    if nullif(trim(person->>'name'),'') is null or not exists(select 1 from public.workspace_members where user_id=(person->>'userId')::uuid and role in ('admin','employee','project_manager')) then raise exception 'Select assignees from the workspace directory'; end if;
  end loop;
  if (select count(distinct value->>'userId') from jsonb_array_elements(data->'assignees'))<>jsonb_array_length(data->'assignees') then raise exception 'Task assignees must be unique'; end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."validate_general_task"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.validate_manual_attendance()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
 if new.source='manual' and (new.notes is null or length(trim(new.notes))<3 or length(new.notes)>2000)
 then raise exception 'Enter an attendance reason (3–2000 characters).'; end if;
 return new;
end; $function$;

REVOKE ALL ON FUNCTION "public"."validate_manual_attendance"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.validate_project_manager_assignment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.role = 'Project Manager' and not exists (
    select 1 from public.workspace_members m
    where m.user_id = new.user_id and m.role = 'project_manager'
  ) then
    raise exception 'Only users with the Project Manager role can be assigned as project manager';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_task_assignees()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ declare person jsonb; target uuid; self_create boolean=false;
begin
  if TG_OP='UPDATE' and new.assignees is not distinct from old.assignees and new.assignee_user_id is not distinct from old.assignee_user_id then return new; end if;
  if new.assignees='[]'::jsonb then return new; end if;
  self_create=TG_OP='INSERT' and public.current_workspace_role()='employee'
    and new.assignee_user_id=auth.uid() and jsonb_array_length(new.assignees)=1
    and new.assignees->0->>'userId'=auth.uid()::text
    and (exists(select 1 from public.project_team_members t where t.project_id=new.project_id and t.user_id=auth.uid())
      or exists(select 1 from public.project_work_items w where w.project_id=new.project_id and w.id<>new.id and public.is_task_assignee(w.id)));
  if not coalesce(public.can_manage_workspace(),false) and not coalesce(self_create,false) then raise exception 'Only administrators and project managers can change task assignees' using errcode='42501'; end if;
  if jsonb_typeof(new.assignees)<>'array' then raise exception 'Task assignees must be a list'; end if;
  for person in select value from jsonb_array_elements(new.assignees) loop
    target=nullif(person->>'userId','')::uuid;
    if target is null or nullif(trim(person->>'name'),'') is null or not exists(select 1 from public.workspace_members m where m.user_id=target and m.role in ('admin','employee','project_manager')) then raise exception 'Select assignees from the workspace directory'; end if;
  end loop;
  if (select count(distinct entry.value->>'userId') from jsonb_array_elements(new.assignees) as entry(value))<>jsonb_array_length(new.assignees) then raise exception 'Task assignees must be unique'; end if;
  if new.assignee_user_id is distinct from (new.assignees->0->>'userId')::uuid then raise exception 'The primary task assignee must match the first selected assignee'; end if;
  return new;
end $function$;

REVOKE ALL ON FUNCTION "public"."validate_task_assignees"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.workspace_client (
  p_company text,
  p_name    text,
  p_email   text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$ declare result uuid; account uuid;
begin
  select id into account from auth.users where lower(email)=lower(p_email) and email_confirmed_at is not null limit 1;
  select id into result from public.clients where lower(company_name)=lower(p_company) and lower(coalesce(email,''))=lower(coalesce(p_email,'')) order by created_at limit 1;
  if result is null then
    insert into public.clients(company_name,contact_name,email,client_user_id) values(coalesce(nullif(p_company,''),p_name,'Client'),p_name,p_email,account) returning id into result;
  else
    update public.clients set contact_name=coalesce(nullif(p_name,''),contact_name), client_user_id=coalesce(client_user_id,account) where id=result;
  end if;
  return result;
end; $function$;

REVOKE ALL ON FUNCTION "public"."workspace_client"(text, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.workspace_schema_version()
  RETURNS integer
  LANGUAGE sql
  STABLE
  AS $function$ select 1; $function$;

REVOKE ALL ON FUNCTION "public"."workspace_schema_version"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.workspace_upsert_row (
  p_table    text,
  p_row      jsonb,
  p_conflict text  DEFAULT 'id'::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$ declare cols text; vals text; updates text; result uuid;
begin
  if p_table not in ('clients','leads','projects','proposals','proposal_follow_ups','project_team_members','project_work_items','project_links','managed_projects','invoices','general_tasks') then raise exception 'Invalid table'; end if;
  select string_agg(format('%I',key),',' order by key), string_agg(format('r.%I',key),',' order by key),
    string_agg(format('%I=excluded.%I',key,key),',' order by key) filter(where key not in ('id','created_at','created_by'))
    into cols,vals,updates from jsonb_object_keys(p_row) key
    where exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=key);
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict (%s) do update set %s returning id',p_table,cols,vals,p_table,p_conflict,updates) using p_row into result;
  return result;
end; $function$;

REVOKE ALL ON FUNCTION "public"."workspace_upsert_row"(text, jsonb, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."attendance_audit"
  ADD CONSTRAINT "attendance_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."audit_events"
  ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."clients"
  ADD CONSTRAINT "clients_client_user_id_fkey" FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."general_tasks"
  ADD CONSTRAINT "general_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."invoice_payment_references"
  ADD CONSTRAINT "invoice_payment_references_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id);

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoice_payment_references"
  ADD CONSTRAINT "invoice_payment_references_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE "public"."leads"
  ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE "public"."leads"
  ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE "public"."managed_projects"
  ADD CONSTRAINT "managed_projects_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_clients"
  ADD CONSTRAINT "project_clients_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_messages"
  ADD CONSTRAINT "project_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id);

ALTER TABLE "public"."project_team_members"
  ADD CONSTRAINT "project_team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."project_work_items"
  ADD CONSTRAINT "project_work_items_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE "public"."invoices"
  ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."managed_projects"
  ADD CONSTRAINT "managed_projects_source_project_id_fkey" FOREIGN KEY (source_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."project_clients"
  ADD CONSTRAINT "project_clients_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_links"
  ADD CONSTRAINT "project_links_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_messages"
  ADD CONSTRAINT "project_messages_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_team_members"
  ADD CONSTRAINT "project_team_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE "public"."project_work_items"
  ADD CONSTRAINT "project_work_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE "public"."proposal_events"
  ADD CONSTRAINT "proposal_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."proposals"
  ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE "public"."proposals"
  ADD CONSTRAINT "proposals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."proposals"
  ADD CONSTRAINT "proposals_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

ALTER TABLE "public"."projects"
  ADD CONSTRAINT "projects_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE SET NULL;

ALTER TABLE "public"."proposal_events"
  ADD CONSTRAINT "proposal_events_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;

ALTER TABLE "public"."proposal_follow_ups"
  ADD CONSTRAINT "proposal_follow_ups_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;

ALTER TABLE "public"."qa_reports"
  ADD CONSTRAINT "qa_reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."qa_reports"
  ADD CONSTRAINT "qa_reports_general_task_id_fkey" FOREIGN KEY (general_task_id) REFERENCES public.general_tasks(id) ON DELETE SET NULL;

ALTER TABLE "public"."qa_reports"
  ADD CONSTRAINT "qa_reports_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE "public"."qa_reports"
  ADD CONSTRAINT "qa_reports_task_id_fkey" FOREIGN KEY (task_id) REFERENCES public.project_work_items(id) ON DELETE SET NULL;

ALTER TABLE "public"."workspace_members"
  ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."workspace_mutations"
  ADD CONSTRAINT "workspace_mutations_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."workspace_notifications"
  ADD CONSTRAINT "workspace_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."workspace_reviews"
  ADD CONSTRAINT "workspace_reviews_reporter_user_id_fkey" FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX attendance_one_open_session ON public.attendance_sessions USING btree (user_id)
  WHERE (checked_out_at IS NULL);

CREATE INDEX attendance_sessions_date ON public.attendance_sessions USING btree (work_date, user_id);

CREATE INDEX leads_client_id_idx ON public.leads USING btree (client_id);

CREATE INDEX leads_email_idx ON public.leads USING btree (lower(email));

CREATE INDEX leads_status_idx ON public.leads USING btree (status);

CREATE INDEX project_clients_client_idx ON public.project_clients USING btree (client_id, project_id);

CREATE INDEX project_messages_project_idx ON public.project_messages USING btree (project_id, created_at);

CREATE UNIQUE INDEX project_work_items_external_id_idx ON public.project_work_items USING btree (project_id, external_id)
  WHERE (external_id IS NOT NULL);

CREATE INDEX proposals_lead_id_idx ON public.proposals USING btree (lead_id, VERSION DESC);

CREATE INDEX proposals_status_idx ON public.proposals USING btree (status);

CREATE INDEX qa_reports_project_idx ON public.qa_reports USING btree (project_id);

CREATE UNIQUE INDEX workspace_members_unique_user_idx ON public.workspace_members USING btree (user_id)
  WHERE (user_id IS NOT NULL);

CREATE INDEX workspace_members_user_id_idx ON public.workspace_members USING btree (user_id);

CREATE INDEX workspace_mutations_created_idx ON public.workspace_mutations USING btree (created_at);

CREATE INDEX workspace_notifications_recipient_idx ON public.workspace_notifications USING btree (recipient_id, created_at DESC);

CREATE INDEX workspace_records_collection_order_idx ON public.workspace_records USING btree (collection, sort_order);

CREATE INDEX workspace_reviews_created_idx ON public.workspace_reviews USING btree (created_at DESC);

CREATE INDEX workspace_reviews_reporter_idx ON public.workspace_reviews USING btree (reporter_user_id, created_at DESC);

CREATE INDEX workspace_reviews_status_idx ON public.workspace_reviews USING btree (status, created_at DESC);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER attendance_manual_reason
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_manual_attendance();

CREATE TRIGGER attendance_record_audit
  AFTER INSERT OR DELETE OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_attendance_record();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER notify_general_task_assignment
  AFTER INSERT OR UPDATE ON public.general_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_general_task_assignment();

CREATE TRIGGER validate_general_task
  BEFORE INSERT OR UPDATE ON public.general_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_general_task();

CREATE TRIGGER reject_internal_project_invoice
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_internal_project_commercial_link();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER reject_internal_project_retainer
  BEFORE INSERT OR UPDATE ON public.managed_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_internal_project_commercial_link();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.managed_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.managed_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER validate_project_manager_assignment
  BEFORE INSERT OR UPDATE ON public.project_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_project_manager_assignment();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.project_team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER project_status_after_task_assignment
  AFTER INSERT OR UPDATE OF assignee_user_id, assignee_name, assignees, project_id ON public.project_work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.project_status_after_task_assignment();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.project_work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER validate_task_assignees
  AFTER INSERT OR UPDATE OF assignees, assignee_user_id ON public.project_work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_assignees();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.project_work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER prevent_project_type_change
  BEFORE UPDATE OF project_type ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_project_type_change();

CREATE TRIGGER sync_project_clients
  AFTER INSERT OR UPDATE OF additional_clients, client_id ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_project_clients();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER clear_deleted_project_manager
  AFTER DELETE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_ineligible_project_manager();

CREATE TRIGGER clear_ineligible_project_manager
  AFTER UPDATE OF ROLE, user_id ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_ineligible_project_manager();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER workspace_activity
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.record_workspace_activity();

CREATE TRIGGER workspace_keep_admin
  BEFORE DELETE OR UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.keep_workspace_admin();

CREATE TRIGGER touch_updated_at
  BEFORE UPDATE ON public.workspace_records
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER set_workspace_review_reporter
  BEFORE INSERT ON public.workspace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workspace_review_reporter();

CREATE TRIGGER touch_workspace_reviews_updated_at
  BEFORE UPDATE ON public.workspace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "admin read attendance audit" ON "public"."attendance_audit"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_admin());

CREATE POLICY "admin manage attendance" ON "public"."attendance_records"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "read team attendance" ON "public"."attendance_records"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_internal_workspace_user() AND ((user_id = auth.uid()) OR public.is_workspace_admin())));

CREATE POLICY "read attendance sessions" ON "public"."attendance_sessions"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_internal_workspace_user() AND ((user_id = auth.uid()) OR public.is_workspace_admin())));

CREATE POLICY "internal attendance settings" ON "public"."attendance_settings"
  FOR SELECT
  TO "authenticated"
  USING (public.is_internal_workspace_user());

CREATE POLICY "admins read audit" ON "public"."audit_events"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_admin());

CREATE POLICY "employees read commercial records" ON "public"."clients"
  FOR SELECT
  TO "authenticated"
  USING (public.employee_can_access_client(id));

CREATE POLICY "project managers operational access" ON "public"."clients"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."clients"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "members read assigned general tasks" ON "public"."general_tasks"
  FOR SELECT
  TO "authenticated"
  USING ((public.can_manage_workspace() OR ((public.current_workspace_role() = 'employee'::text) AND (((task ->> 'assigneeId'::text) = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM jsonb_array_elements((general_tasks.task -> 'assignees'::text)) person(VALUE)
  WHERE ((person.value ->> 'userId'::text) = (auth.uid())::text)))))));

CREATE POLICY "read own payment references or admin" ON "public"."invoice_payment_references"
  FOR SELECT
  TO "authenticated"
  USING (((public.current_workspace_role() = 'admin'::text) OR (submitted_by = auth.uid())));

CREATE POLICY "project managers operational access" ON "public"."invoices"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."invoices"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project managers operational access" ON "public"."leads"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."leads"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project managers operational access" ON "public"."managed_projects"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."managed_projects"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "read own profile" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (((id = auth.uid()) OR public.is_workspace_admin()));

CREATE POLICY "workspace participants read client links" ON "public"."project_clients"
  FOR SELECT
  TO "authenticated"
  USING ((public.can_manage_workspace() OR public.employee_can_access_project(project_id) OR public.client_can_access_project(project_id)));

CREATE POLICY "employees read assigned project links" ON "public"."project_links"
  FOR SELECT
  TO "authenticated"
  USING (((public.current_workspace_role() = ANY (ARRAY['employee'::text, 'project_manager'::text])) AND public.employee_can_access_project(project_id)));

CREATE POLICY "project managers operational access" ON "public"."project_links"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."project_links"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project participants read messages" ON "public"."project_messages"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (p.id = project_messages.project_id))) OR public.client_can_access_project(project_id)));

CREATE POLICY "project participants send messages" ON "public"."project_messages"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((sender_id = auth.uid()) AND ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE (p.id = project_messages.project_id))) OR public.client_can_access_project(project_id))));

CREATE POLICY "employees read assigned project team" ON "public"."project_team_members"
  FOR SELECT
  TO "authenticated"
  USING (((public.current_workspace_role() = ANY (ARRAY['employee'::text, 'project_manager'::text])) AND public.employee_can_access_project(project_id)));

CREATE POLICY "project managers operational access" ON "public"."project_team_members"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."project_team_members"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "employees read assigned project tasks" ON "public"."project_work_items"
  FOR SELECT
  TO "authenticated"
  USING (((public.current_workspace_role() = ANY (ARRAY['employee'::text, 'project_manager'::text])) AND public.employee_can_access_project(project_id)));

CREATE POLICY "project managers operational access" ON "public"."project_work_items"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."project_work_items"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "employees read assigned projects" ON "public"."projects"
  FOR SELECT
  TO "authenticated"
  USING (((public.current_workspace_role() = ANY (ARRAY['employee'::text, 'project_manager'::text])) AND public.employee_can_access_project(id)));

CREATE POLICY "project managers operational access" ON "public"."projects"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."projects"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project managers operational access" ON "public"."proposal_events"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."proposal_events"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project managers operational access" ON "public"."proposal_follow_ups"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."proposal_follow_ups"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "project managers operational access" ON "public"."proposals"
  FOR ALL
  TO "authenticated"
  USING ((public.current_workspace_role() = 'project_manager'::text))
  WITH CHECK ((public.current_workspace_role() = 'project_manager'::text));

CREATE POLICY "workspace administrators manage records" ON "public"."proposals"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "internal users read QA reports" ON "public"."qa_reports"
  FOR SELECT
  TO "authenticated"
  USING ((public.can_manage_workspace() OR ((public.current_workspace_role() = 'employee'::text) AND ((created_by = auth.uid()) OR ((project_id IS
    NOT NULL) AND public.employee_can_access_project(project_id))))));

CREATE POLICY "members read membership" ON "public"."workspace_members"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (lower(email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.is_workspace_admin()));

CREATE POLICY "recipient dismisses" ON "public"."workspace_notifications"
  FOR DELETE
  TO "authenticated"
  USING ((recipient_id = auth.uid()));

CREATE POLICY "recipient reads" ON "public"."workspace_notifications"
  FOR SELECT
  TO "authenticated"
  USING ((recipient_id = auth.uid()));

CREATE POLICY "recipient updates" ON "public"."workspace_notifications"
  FOR UPDATE
  TO "authenticated"
  USING ((recipient_id = auth.uid()))
  WITH CHECK ((recipient_id = auth.uid()));

CREATE POLICY "workspace administrators manage records" ON "public"."workspace_records"
  FOR ALL
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "workspace admins delete reviews" ON "public"."workspace_reviews"
  FOR DELETE
  TO "authenticated"
  USING ((public.is_workspace_admin() AND (status = 'RESOLVED'::text)));

CREATE POLICY "workspace admins update reviews" ON "public"."workspace_reviews"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin())
  WITH CHECK (public.is_workspace_admin());

CREATE POLICY "workspace members submit reviews" ON "public"."workspace_reviews"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_internal_workspace_user() AND (reporter_user_id = auth.uid())));

CREATE POLICY "workspace reviews read own or admin" ON "public"."workspace_reviews"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_workspace_admin() OR ((public.current_workspace_role() = ANY (ARRAY['employee'::text, 'project_manager'::text])) AND (reporter_user_id = auth.uid()))));

GRANT EXECUTE ON FUNCTION "public"."assign_qa_report"(uuid, text, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."assign_qa_report"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_qa_report"(uuid, text, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."assign_qa_report"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."audit_attendance_record"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_attendance_record"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_attendance_record"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."bootstrap_workspace_admin"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."bootstrap_workspace_admin"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."bootstrap_workspace_admin"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."can_manage_workspace"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."can_manage_workspace"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."can_manage_workspace"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."can_manage_workspace"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_initial_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_initial_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_initial_admin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."clear_ineligible_project_manager"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."clear_ineligible_project_manager"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_ineligible_project_manager"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_ineligible_project_manager"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."clear_password_change_requirement"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."clear_password_change_requirement"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_password_change_requirement"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."clear_password_change_requirement"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."client_can_access_project"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."client_can_access_project"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."client_can_access_project"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."client_can_access_project"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."correct_attendance_checkout"(uuid, timestamp WITH time zone, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."correct_attendance_checkout"(uuid, timestamp WITH time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."correct_attendance_checkout"(uuid, timestamp WITH time zone, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."correct_attendance_checkout"(uuid, timestamp WITH time zone, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."current_workspace_role"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."current_workspace_role"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_workspace_role"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_workspace_role"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_qa_report"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_resolved_qa_report"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_qa_report"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_qa_report"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_review"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_resolved_review"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_review"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_resolved_review"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_client"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."employee_can_access_client"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_client"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_client"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_project"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."employee_can_access_project"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_project"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_can_access_project"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."employee_existing_task_update_allowed"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_existing_task_update_allowed"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_existing_task_update_allowed"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."employee_general_task_save_allowed"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_general_task_save_allowed"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_general_task_save_allowed"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."employee_project_task_update_allowed"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_project_task_update_allowed"(uuid, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."employee_project_task_update_allowed"(uuid, jsonb) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_internal_workspace_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_internal_workspace_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_internal_workspace_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_internal_workspace_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_task_assignee"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."is_task_assignee"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_task_assignee"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_task_assignee"(uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_workspace_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_workspace_admin"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."issue_attendance_challenge"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."issue_attendance_challenge"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_attendance_challenge"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_attendance_challenge"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."keep_workspace_admin"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."keep_workspace_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."keep_workspace_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."keep_workspace_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."notify_general_task_assignment"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."notify_general_task_assignment"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."notify_general_task_assignment"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."prevent_project_type_change"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."prevent_project_type_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_project_type_change"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_project_type_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."project_status_after_task_assignment"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."project_status_after_task_assignment"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."project_status_after_task_assignment"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."read_client_projects"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."read_client_projects"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_client_projects"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_client_projects"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."read_client_records"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."read_client_records"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_client_records"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_client_records"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."read_shared_proposal"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_shared_proposal"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."read_shared_proposal"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_workspace_activity"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."record_workspace_activity"() TO "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."record_workspace_activity"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_workspace_activity"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_workspace_activity"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."reject_internal_project_commercial_link"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."reject_internal_project_commercial_link"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_internal_project_commercial_link"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_internal_project_commercial_link"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."reserve_workspace_number"(text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."reserve_workspace_number"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reserve_workspace_number"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."reserve_workspace_number"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."respond_shared_proposal"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."respond_shared_proposal"(text, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."respond_shared_proposal"(text, text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_changes"(jsonb, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."save_workspace_changes"(jsonb, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_changes"(jsonb, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_changes"(jsonb, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."scan_attendance"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."scan_attendance"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."scan_attendance"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."scan_attendance"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_qa_report_status"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_qa_report_status"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_qa_report_status"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_qa_report_status"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_member_role"(text, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_workspace_member_role"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_member_role"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_member_role"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_workspace_review_reporter"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_review_reporter"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_workspace_review_reporter"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."submit_invoice_payment_reference"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."submit_invoice_payment_reference"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_invoice_payment_reference"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_invoice_payment_reference"(uuid, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."submit_qa_report"(uuid, text, text, text, text, uuid, text, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."submit_qa_report"(uuid, text, text, text, text, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_qa_report"(uuid, text, text, text, text, uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."submit_qa_report"(uuid, text, text, text, text, uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_project_clients"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_project_clients"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_project_clients"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."valid_compressed_image"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."valid_compressed_image"(text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."valid_compressed_image"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_general_task"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_general_task"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_general_task"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_manual_attendance"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_manual_attendance"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_manual_attendance"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."validate_project_manager_assignment"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."validate_project_manager_assignment"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_project_manager_assignment"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_project_manager_assignment"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_task_assignees"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_task_assignees"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_task_assignees"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_client"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_client"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_client"(text, text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."workspace_schema_version"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."workspace_schema_version"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_schema_version"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_schema_version"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_upsert_row"(text, jsonb, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_upsert_row"(text, jsonb, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_upsert_row"(text, jsonb, text) TO "service_role";

REVOKE ALL ON TABLE "public"."attendance_audit" FROM "authenticated";

GRANT SELECT ON TABLE "public"."attendance_audit" TO "authenticated";

REVOKE ALL ON TABLE "public"."attendance_audit" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_audit" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_audit" TO "service_role";

REVOKE ALL ON TABLE "public"."attendance_challenges" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_challenges" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_challenges" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_records" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."attendance_records" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_records" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_records" TO "service_role";

REVOKE ALL ON TABLE "public"."attendance_sessions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."attendance_sessions" TO "authenticated";

REVOKE ALL ON TABLE "public"."attendance_sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_sessions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_settings" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."attendance_settings" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_settings" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_settings" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_events" TO "anon";

REVOKE ALL ON TABLE "public"."audit_events" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."audit_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."audit_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "anon";

REVOKE ALL ON TABLE "public"."clients" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."clients" TO "authenticated";

REVOKE ALL ON TABLE "public"."clients" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "service_role";

REVOKE ALL ON TABLE "public"."general_tasks" FROM "authenticated";

GRANT SELECT ON TABLE "public"."general_tasks" TO "authenticated";

REVOKE ALL ON TABLE "public"."general_tasks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."general_tasks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."general_tasks" TO "service_role";

REVOKE ALL ON TABLE "public"."invoice_payment_references" FROM "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."invoice_payment_references" TO "anon";

REVOKE ALL ON TABLE "public"."invoice_payment_references" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."invoice_payment_references" TO "authenticated";

REVOKE ALL ON TABLE "public"."invoice_payment_references" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_payment_references" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_payment_references" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "anon";

REVOKE ALL ON TABLE "public"."invoices" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."invoices" TO "authenticated";

REVOKE ALL ON TABLE "public"."invoices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "anon";

REVOKE ALL ON TABLE "public"."leads" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."leads" TO "authenticated";

REVOKE ALL ON TABLE "public"."leads" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."leads" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."managed_projects" TO "anon";

REVOKE ALL ON TABLE "public"."managed_projects" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."managed_projects" TO "authenticated";

REVOKE ALL ON TABLE "public"."managed_projects" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."managed_projects" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."managed_projects" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."project_clients" FROM "authenticated";

GRANT SELECT ON TABLE "public"."project_clients" TO "authenticated";

REVOKE ALL ON TABLE "public"."project_clients" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_clients" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_clients" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_links" TO "anon";

REVOKE ALL ON TABLE "public"."project_links" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."project_links" TO "authenticated";

REVOKE ALL ON TABLE "public"."project_links" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_links" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_links" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_messages" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."project_messages" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_messages" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_team_members" TO "anon";

REVOKE ALL ON TABLE "public"."project_team_members" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."project_team_members" TO "authenticated";

REVOKE ALL ON TABLE "public"."project_team_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_team_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_team_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_work_items" TO "anon";

REVOKE ALL ON TABLE "public"."project_work_items" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."project_work_items" TO "authenticated";

REVOKE ALL ON TABLE "public"."project_work_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_work_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."project_work_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "anon";

REVOKE ALL ON TABLE "public"."projects" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."projects" TO "authenticated";

REVOKE ALL ON TABLE "public"."projects" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."projects" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_events" TO "anon";

REVOKE ALL ON TABLE "public"."proposal_events" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."proposal_events" TO "authenticated";

REVOKE ALL ON TABLE "public"."proposal_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_events" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_follow_ups" TO "anon";

REVOKE ALL ON TABLE "public"."proposal_follow_ups" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."proposal_follow_ups" TO "authenticated";

REVOKE ALL ON TABLE "public"."proposal_follow_ups" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_follow_ups" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposal_follow_ups" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposals" TO "anon";

REVOKE ALL ON TABLE "public"."proposals" FROM "authenticated";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."proposals" TO "authenticated";

REVOKE ALL ON TABLE "public"."proposals" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposals" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."proposals" TO "service_role";

REVOKE ALL ON TABLE "public"."qa_reports" FROM "authenticated";

GRANT SELECT ON TABLE "public"."qa_reports" TO "authenticated";

REVOKE ALL ON TABLE "public"."qa_reports" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."qa_reports" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."qa_reports" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_members" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."workspace_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_members" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_mutations" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_mutations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_mutations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_notifications" TO "anon";

REVOKE ALL ("read") ON TABLE "public"."workspace_notifications" FROM "authenticated";

GRANT UPDATE ("read") ON TABLE "public"."workspace_notifications" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_notifications" TO "authenticated";

REVOKE ALL ON TABLE "public"."workspace_notifications" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_notifications" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_notifications" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_number_counters" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_number_counters" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_number_counters" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_records" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."workspace_records" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_records" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_records" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_reviews" TO "authenticated";

REVOKE ALL ON TABLE "public"."workspace_reviews" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_reviews" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_reviews" TO "service_role";

ALTER TABLE "public"."qa_reports"
  ADD CONSTRAINT "qa_reports_image_check"
    CHECK
    ((public.valid_compressed_image(image_data_url, 358400) AND ((image_name IS NULL) OR ((length(TRIM(BOTH FROM image_name)) >= 1) AND (length(TRIM(BOTH FROM image_name)) <=
    200))) AND ((image_data_url IS NOT NULL) OR (image_name IS NULL))));


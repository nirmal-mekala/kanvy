CREATE SCHEMA "public";
CREATE SCHEMA "app_data";
CREATE TYPE "app_data"."entity_status" AS ENUM('active', 'trashed');
CREATE TYPE "app_data"."color_key" AS ENUM('gray', 'coral', 'orange', 'amber', 'lime', 'teal', 'sky', 'violet', 'pink');
CREATE TYPE "app_data"."pattern_key" AS ENUM('none', 'falling-triangles', 'leaf', 'wiggle', 'plus', 'lines-in-motion', 'topography', 'rain', 'squares');
CREATE TYPE "app_data"."task_status" AS ENUM('none', 'todo', 'blocked', 'in_progress', 'done');
CREATE TYPE "app_data"."node_type" AS ENUM('card', 'container');
CREATE TYPE "app_data"."card_type" AS ENUM('board', 'text', 'link', 'image');
CREATE TYPE "app_data"."text_size" AS ENUM('regular', 'h1', 'h2', 'h3');
CREATE TYPE "app_data"."side" AS ENUM('top', 'right', 'bottom', 'left');
CREATE TYPE "app_data"."direction" AS ENUM('none', 'forward', 'backward');
CREATE TABLE "app_data"."boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"status" "app_data"."entity_status" DEFAULT 'active'::"app_data"."entity_status" NOT NULL,
	"is_root" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "app_data"."edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"board_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"from_side" "app_data"."side" NOT NULL,
	"to_node_id" uuid NOT NULL,
	"to_side" "app_data"."side" NOT NULL,
	"direction" "app_data"."direction" DEFAULT 'none'::"app_data"."direction" NOT NULL,
	"status" "app_data"."entity_status" DEFAULT 'active'::"app_data"."entity_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "app_data"."images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"data_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "app_data"."nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"board_id" uuid NOT NULL,
	"status" "app_data"."entity_status" DEFAULT 'active'::"app_data"."entity_status" NOT NULL,
	"color" "app_data"."color_key" DEFAULT 'gray'::"app_data"."color_key" NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"w" double precision NOT NULL,
	"h" double precision NOT NULL,
	"position" double precision NOT NULL,
	"task" "app_data"."task_status" DEFAULT 'none'::"app_data"."task_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"node_type" "app_data"."node_type" NOT NULL,
	"content" text,
	"card_type" "app_data"."card_type",
	"size" "app_data"."text_size",
	"pattern" "app_data"."pattern_key",
	"image_id" uuid,
	"link_url" text,
	"link_title" text,
	"link_image_url" text,
	"board_ref" uuid
);
CREATE UNIQUE INDEX "boards_pkey" ON "app_data"."boards" ("id");
CREATE INDEX "edges_board_id_idx" ON "app_data"."edges" ("board_id");
CREATE INDEX "edges_from_node_id_idx" ON "app_data"."edges" ("from_node_id");
CREATE UNIQUE INDEX "edges_pkey" ON "app_data"."edges" ("id");
CREATE INDEX "edges_to_node_id_idx" ON "app_data"."edges" ("to_node_id");
CREATE UNIQUE INDEX "images_pkey" ON "app_data"."images" ("id");
CREATE INDEX "nodes_board_id_idx" ON "app_data"."nodes" ("board_id");
CREATE INDEX "nodes_board_ref_idx" ON "app_data"."nodes" ("board_ref");
CREATE INDEX "nodes_image_id_idx" ON "app_data"."nodes" ("image_id");
CREATE UNIQUE INDEX "nodes_pkey" ON "app_data"."nodes" ("id");
ALTER TABLE "app_data"."edges" ADD CONSTRAINT "edges_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "app_data"."boards"("id") ON DELETE CASCADE;
ALTER TABLE "app_data"."edges" ADD CONSTRAINT "edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "app_data"."nodes"("id") ON DELETE CASCADE;
ALTER TABLE "app_data"."edges" ADD CONSTRAINT "edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "app_data"."nodes"("id") ON DELETE CASCADE;
ALTER TABLE "app_data"."nodes" ADD CONSTRAINT "nodes_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "app_data"."boards"("id") ON DELETE CASCADE;
ALTER TABLE "app_data"."nodes" ADD CONSTRAINT "nodes_board_ref_fkey" FOREIGN KEY ("board_ref") REFERENCES "app_data"."boards"("id") ON DELETE RESTRICT;
ALTER TABLE "app_data"."nodes" ADD CONSTRAINT "nodes_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "app_data"."images"("id") ON DELETE RESTRICT;

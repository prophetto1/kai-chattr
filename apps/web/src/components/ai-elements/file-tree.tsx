"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import { typographyStyle } from "@/lib/design-system";
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderOpen,
} from "@tabler/icons-react";
import type { HTMLAttributes, ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface FileTreeContextType {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  density: "default" | "compact";
  showGuides: boolean;
  showStats: boolean;
}

type FileTreeStatus = "added" | "modified" | "deleted";

// Default noop for context default value
// oxlint-disable-next-line eslint(no-empty-function)
const noop = () => {};

const FileTreeContext = createContext<FileTreeContextType>({
  // oxlint-disable-next-line eslint-plugin-unicorn(no-new-builtin)
  expandedPaths: new Set(),
  density: "default",
  showGuides: true,
  showStats: true,
  togglePath: noop,
});

export type FileTreeProps = Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  expanded?: Set<string>;
  defaultExpanded?: Set<string>;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onExpandedChange?: (expanded: Set<string>) => void;
  density?: "default" | "compact";
  showGuides?: boolean;
  showStats?: boolean;
};

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  density = "default",
  showGuides = true,
  showStats = true,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;

  const togglePath = useCallback(
    (path: string) => {
      const newExpanded = new Set(expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      setInternalExpanded(newExpanded);
      onExpandedChange?.(newExpanded);
    },
    [expandedPaths, onExpandedChange]
  );

  const contextValue = useMemo(
    () => ({ density, expandedPaths, onSelect, selectedPath, showGuides, showStats, togglePath }),
    [density, expandedPaths, onSelect, selectedPath, showGuides, showStats, togglePath]
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div
        className={cn(
          "h-full w-full min-w-0 overflow-hidden rounded-none border-0 bg-transparent font-sans leading-tight text-muted-foreground",
          className
        )}
        role="tree"
        {...props}
        style={{ ...typographyStyle(density === "compact" ? "ui.caption" : "ui.body-sm"), ...props.style }}
      >
        <div className={cn(density === "compact" ? "px-0 py-1" : "px-1 py-1")}>
          {children}
        </div>
      </div>
    </FileTreeContext.Provider>
  );
};

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeIcon = ({
  className,
  children,
  ...props
}: FileTreeIconProps) => (
  <span className={cn("shrink-0", className)} {...props}>
    {children}
  </span>
);

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeName = ({
  className,
  children,
  ...props
}: FileTreeNameProps) => (
  <span className={cn("truncate", className)} {...props}>
    {children}
  </span>
);

function FileTreeStats({
  additions,
  deletions,
  status,
}: {
  additions?: number;
  deletions?: number;
  status?: FileTreeStatus;
}) {
  const { showStats } = useContext(FileTreeContext);

  if (!showStats) {
    return null;
  }

  if (!status && additions === undefined && deletions === undefined) {
    return null;
  }

  return (
    <FileTreeActions>
      {additions !== undefined && additions > 0 && (
        <span className="tabular-nums text-emerald-500">+{additions}</span>
      )}
      {deletions !== undefined && deletions > 0 && (
        <span className="tabular-nums text-rose-500">-{deletions}</span>
      )}
      {status && status !== "modified" && (
        <span
          className={cn(
            "min-w-3 text-center",
            status === "added" && "text-emerald-500",
            status === "deleted" && "text-rose-500"
          )}
          style={typographyStyle("ui.overline")}
        >
          {status[0]}
        </span>
      )}
    </FileTreeActions>
  );
}

interface FileTreeFolderContextType {
  path: string;
  name: string;
  isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  isExpanded: false,
  name: "",
  path: "",
});

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  additions?: number;
  deletions?: number;
  status?: FileTreeStatus;
};

export const FileTreeFolder = ({
  path,
  name,
  additions,
  deletions,
  status,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { density, expandedPaths, showGuides, togglePath, selectedPath, onSelect } =
    useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  const handleOpenChange = useCallback(() => {
    togglePath(path);
  }, [togglePath, path]);

  const handleSelect = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const folderContextValue = useMemo(
    () => ({ isExpanded, name, path }),
    [isExpanded, name, path]
  );

  return (
    <FileTreeFolderContext.Provider value={folderContextValue}>
      <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
        <div
          className={cn("w-full min-w-0", className)}
          aria-selected={isSelected}
          role="treeitem"
          tabIndex={0}
          {...props}
        >
          <div
            className={cn(
              "group flex h-[22px] w-full items-center gap-1 rounded-[3px] px-1 text-left text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground",
              density === "compact" &&
                "h-5 gap-0.5 rounded-none px-1.5 hover:bg-muted/55",
              isSelected &&
                (density === "compact"
                  ? "bg-muted/70 text-foreground"
                  : "bg-accent text-accent-foreground")
            )}
          >
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "flex size-[14px] shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-muted-foreground",
                  density === "compact" && "size-3"
                )}
                type="button"
              >
                <IconChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    isExpanded && "rotate-90"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-left"
              onClick={handleSelect}
              type="button"
            >
              <FileTreeIcon>
                {isExpanded ? (
                  <IconFolderOpen
                    className={cn(
                      "size-3.5 text-muted-foreground",
                      density === "compact" && "size-3"
                    )}
                  />
                ) : (
                  <IconFolder
                    className={cn(
                      "size-3.5 text-muted-foreground",
                      density === "compact" && "size-3"
                    )}
                  />
                )}
              </FileTreeIcon>
              <FileTreeName>{name}</FileTreeName>
            </button>
            <FileTreeStats additions={additions} deletions={deletions} status={status} />
          </div>
          <CollapsibleContent>
            <div
              className={cn(
                "min-w-0",
                density === "compact" ? "ml-[4px] pl-1" : "ml-[13px] pl-1",
                showGuides && "border-l border-border/35"
              )}
            >
              {children}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

interface FileTreeFileContextType {
  path: string;
  name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  name: "",
  path: "",
});

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
  status?: FileTreeStatus;
  additions?: number;
  deletions?: number;
};

export const FileTreeFile = ({
  path,
  name,
  icon,
  status,
  additions,
  deletions,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { density, selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;

  const handleClick = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        onSelect?.(path);
      }
    },
    [onSelect, path]
  );

  const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

  return (
    <FileTreeFileContext.Provider value={fileContextValue}>
      <div
        className={cn(
          "group flex h-[22px] w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-[3px] px-1 text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground",
          density === "compact" && "h-5 gap-1 rounded-none px-1.5 hover:bg-muted/55",
          isSelected &&
            (density === "compact"
              ? "bg-muted/70 text-foreground"
              : "bg-accent text-accent-foreground"),
          className
        )}
        aria-selected={isSelected}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        tabIndex={0}
        {...props}
      >
        {children ?? (
          <>
            <span className="size-[14px] shrink-0" />
            <FileTreeIcon>
              {icon ?? (
                <IconFile
                  className={cn(
                    "size-3.5 text-muted-foreground",
                    density === "compact" && "size-3"
                  )}
                />
              )}
            </FileTreeIcon>
            <FileTreeName
              className={cn(
                status === "deleted" && "text-muted-foreground line-through decoration-rose-400/80"
              )}
            >
              {name}
            </FileTreeName>
            <FileTreeStats additions={additions} deletions={deletions} status={status} />
          </>
        )}
      </div>
    </FileTreeFileContext.Provider>
  );
};

export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>;

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

export const FileTreeActions = ({
  className,
  children,
  ...props
}: FileTreeActionsProps) => (
  <div
    className={cn(
      "ml-auto flex shrink-0 items-center gap-1 pl-2",
      className
    )}
    onClick={stopPropagation}
    onKeyDown={stopPropagation}
    role="group"
    {...props}
    style={{ ...typographyStyle("code.stat"), ...props.style }}
  >
    {children}
  </div>
);

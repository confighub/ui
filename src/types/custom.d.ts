// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

declare module '*.svg' {
  import * as React from 'react';

  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;

  const src: string;
  export default src;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// I have no idea why this is needed
declare module '@mui/icons-material/Api';

declare module '@mui/icons-material/ArrowBackIosNew';

declare module '@mui/icons-material/ArrowForwardIos';

declare module '@mui/icons-material/Delete';

declare module '@mui/icons-material/AddCircleOutline';

declare module '@mui/icons-material/Logout';

declare module '@mui/icons-material/OpenInNew';

declare module '@mui/icons-material/MoreVert';

declare module '@mui/icons-material/Code';

declare module '@mui/icons-material/Close';

declare module '@mui/icons-material/Cancel';

declare module '@mui/icons-material/DataObject';

declare module '@mui/icons-material/ExpandMore';

declare module '@mui/icons-material/Cached';

declare module '@mui/icons-material/FolderCopy';

declare module '@mui/icons-material/ArrowForward';

declare module '@mui/icons-material/Block';

declare module '@mui/icons-material/AutoFixHigh';

declare module '@mui/icons-material/CheckCircle';

declare module '@mui/icons-material/ContentCopy';

declare module '@mui/icons-material/Error';

declare module '@mui/icons-material/ArrowBack';

declare module '@mui/icons-material/Clear';

declare module '@mui/icons-material/Add';

// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

export const usePageHeight = (sectionOffset: number) => {
  const [pageHeight, setPageHeight] = useState(window.innerHeight - sectionOffset);

  const updateEditorHeight = () => {
    const remainingHeight = window.innerHeight - sectionOffset;
    setPageHeight(remainingHeight);
  };

  useEffect(() => {
    updateEditorHeight();
    window.addEventListener('resize', updateEditorHeight);
    return () => {
      window.removeEventListener('resize', updateEditorHeight);
    };
  }, [sectionOffset]);

  return pageHeight;
};

import { useCallback, useState } from 'react';

export default function useAppDialog() {
  const [dialog, setDialog] = useState({
    visible: false,
    title: '',
    message: '',
    variant: 'info',
    actions: [],
  });

  const hideDialog = useCallback(() => {
    setDialog((prev) => ({ ...prev, visible: false }));
  }, []);

  const showDialog = useCallback((config) => {
    setDialog({
      visible: true,
      title: config.title || 'Heads up',
      message: config.message || '',
      variant: config.variant || 'info',
      actions: config.actions || [],
    });
  }, []);

  return {
    showDialog,
    hideDialog,
    dialogProps: {
      ...dialog,
      onClose: hideDialog,
    },
  };
}

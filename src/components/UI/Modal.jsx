import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function  Modal({children,open,className = '', onClose}) {

    const dialog = useRef();
    useEffect(() => {
        const modal = dialog.current;
        if (open) {
            modal.showModal();
            document.body.style.overflow = 'hidden';
        }
        return () => {
            modal.close();
            // Only restore scroll if no other dialogs are open
            const openDialogs = document.querySelectorAll('dialog[open]');
            if (openDialogs.length <= 1) {
                document.body.style.overflow = '';
            }
        };
    }, [open]);

    // Close on backdrop click
    function handleBackdropClick(e) {
        if (e.target === dialog.current) {
            onClose();
        }
    }

    return createPortal(
    <dialog ref={dialog} className={`modal ${className}`} onClose={onClose} onClick={handleBackdropClick}>
        {children}
        </dialog>,
     document.getElementById('modal')
    );
}
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-4 px-6 py-4 bg-slate-50 rounded-xl border border-slate-100"
    >
      {/* Infos */}
      <div className="text-sm text-slate-600 font-semibold">
        <span>
          {totalItems === 0
            ? 'Aucun résultat'
            : `${startItem.toLocaleString('fr-DZ')} - ${endItem.toLocaleString('fr-DZ')} sur ${totalItems.toLocaleString('fr-DZ')}`}
        </span>
      </div>

      {/* Sélecteur de taille */}
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:border-primary transition-colors"
      >
        {pageSizeOptions.map((size) => (
          <option key={size} value={size}>
            {size} par page
          </option>
        ))}
      </select>

      {/* Contrôles */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={cn(
            'p-2 rounded-lg transition-all',
            currentPage === 1
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-white text-slate-600 hover:bg-primary hover:text-white border border-slate-200'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        {/* Pages */}
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
            let page: number;

            if (totalPages <= 5) {
              page = idx + 1;
            } else if (currentPage <= 3) {
              page = idx + 1;
            } else if (currentPage >= totalPages - 2) {
              page = totalPages - 4 + idx;
            } else {
              page = currentPage - 2 + idx;
            }

            return (
              <motion.button
                key={page}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onPageChange(page)}
                className={cn(
                  'w-8 h-8 rounded-lg font-bold text-sm transition-all',
                  page === currentPage
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-primary hover:text-primary'
                )}
              >
                {page}
              </motion.button>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={cn(
            'p-2 rounded-lg transition-all',
            currentPage === totalPages
              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
              : 'bg-white text-slate-600 hover:bg-primary hover:text-white border border-slate-200'
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Indicateur */}
      <div className="text-sm font-semibold text-slate-600">
        Page <span className="text-primary font-black">{currentPage}</span> sur{' '}
        <span className="text-primary font-black">{totalPages}</span>
      </div>
    </motion.div>
  );
};

export default Pagination;

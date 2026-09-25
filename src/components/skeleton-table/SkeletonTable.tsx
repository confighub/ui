// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export const SkeletonTable = () => {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>
              <Skeleton variant='text' width={100} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={150} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={120} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={150} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={180} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={100} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={120} />
            </TableCell>
            <TableCell>
              <Skeleton variant='text' width={120} />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...Array(5)].map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
              <TableCell>
                <Skeleton variant='text' width='80%' />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
